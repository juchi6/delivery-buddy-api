import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app-config';
import { AppModule } from '../src/app.module';
import { CacheService } from '../src/common/cache/cache.service';
import { MockRouteProvider } from '../src/deliveries/providers/mock.route.provider';
import { PrismaService } from '../src/prisma/prisma.service';

const RUN_ID = Date.now().toString();
const testEmail = (n: number) => `e2e-del-${RUN_ID}-${n}@test.com`;

// These tests are stateful in sequence:
//   seed deliveries → read endpoints → route cache check → status transitions

describe('Deliveries (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cache: CacheService;
  let mockProvider: MockRouteProvider;

  let accessToken: string;
  let driverId: string;
  let altToken: string;
  let altDriverId: string;

  const createdDriverIds: string[] = [];
  const createdDeliveryIds: string[] = [];

  // IDs of seeded deliveries for reuse across tests
  let inProgressDeliveryId: string;
  let pendingDeliveryId: string;
  let statusTestDeliveryId: string; // PENDING delivery used exclusively for PATCH status tests
  let altDeliveryId: string;       // belongs to alt driver — used for cross-driver 404 tests

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = module.get(PrismaService);
    cache = module.get(CacheService);
    mockProvider = module.get(MockRouteProvider);

    // ── Create primary driver ──────────────────────────────────────────────
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        workId: `WK-DEL-${RUN_ID}`,
        firstName: 'Jane',
        lastName: 'Doe',
        email: testEmail(1),
        password: 'Password123!',
      });
    accessToken = signup.body.accessToken as string;
    driverId = signup.body.driver.id as string;
    createdDriverIds.push(driverId);

    // ── Create alternate driver ────────────────────────────────────────────
    const alt = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        workId: `WK-DEL-ALT-${RUN_ID}`,
        firstName: 'Alt',
        lastName: 'Driver',
        email: testEmail(2),
        password: 'Password123!',
      });
    altToken = alt.body.accessToken as string;
    altDriverId = alt.body.driver.id as string;
    createdDriverIds.push(altDriverId);

    // ── Seed deliveries directly via Prisma ───────────────────────────────
    // Bypassing a "create delivery" endpoint (not in scope) — seed is test infrastructure only.

    const baseDelivery = {
      pickupName: 'Restaurant A',
      pickupAddress: '123 Main St, New York, NY',
      destinationCustomerName: 'John Customer',
      destinationAddress: '456 Oak Ave, Brooklyn, NY',
      destinationPhone: '+1234567890',
      totalAmount: 25.00,
      driverEarning: 8.00,
      tipAmount: 2.00,
      paymentMethod: 'Card',
    };

    const withItems = {
      orderItems: {
        create: [
          // lineTotal = (basePrice + extraPrice) × quantity = (12 + 2) × 1 = 14
          {
            name: 'Ham and Cheese Pizza 11 inch',
            basePrice: 12,
            modifiersDescription: '11 inch, extra cheese',
            extraPrice: 2,
            quantity: 1,
            lineTotal: 14,
          },
          // lineTotal = (3 + 0) × 2 = 6
          { name: 'Soda', basePrice: 3, extraPrice: 0, quantity: 2, lineTotal: 6 },
        ],
      },
    };

    const inProgress = await prisma.delivery.create({
      data: { ...baseDelivery, orderNumber: `ORD-IP-${RUN_ID}`, status: DeliveryStatus.IN_PROGRESS, driverId, ...withItems },
    });
    inProgressDeliveryId = inProgress.id;
    createdDeliveryIds.push(inProgressDeliveryId);

    const pending = await prisma.delivery.create({
      data: { ...baseDelivery, orderNumber: `ORD-PEND-${RUN_ID}`, status: DeliveryStatus.PENDING, driverId, ...withItems },
    });
    pendingDeliveryId = pending.id;
    createdDeliveryIds.push(pendingDeliveryId);

    const statusTest = await prisma.delivery.create({
      data: { ...baseDelivery, orderNumber: `ORD-STAT-${RUN_ID}`, status: DeliveryStatus.PENDING, driverId },
    });
    statusTestDeliveryId = statusTest.id;
    createdDeliveryIds.push(statusTestDeliveryId);

    const altDel = await prisma.delivery.create({
      data: { ...baseDelivery, orderNumber: `ORD-ALT-${RUN_ID}`, status: DeliveryStatus.PENDING, driverId: altDriverId },
    });
    altDeliveryId = altDel.id;
    createdDeliveryIds.push(altDeliveryId);

    // Pre-clear any stale route cache for the deliveries we just created
    await cache.invalidate(`route:${inProgressDeliveryId}`);
    await cache.invalidate(`route:${pendingDeliveryId}`);
  });

  afterAll(async () => {
    if (createdDriverIds.length) {
      // Delete deliveries by driverId rather than tracked IDs — safer if beforeAll
      // timed out mid-seeding and createdDeliveryIds is only partially filled.
      await prisma.delivery.deleteMany({ where: { driverId: { in: createdDriverIds } } });
      await prisma.shift.deleteMany({ where: { driverId: { in: createdDriverIds } } });
      await prisma.transaction.deleteMany({ where: { driverId: { in: createdDriverIds } } });
      await prisma.notification.deleteMany({ where: { driverId: { in: createdDriverIds } } });
      await prisma.driver.deleteMany({ where: { id: { in: createdDriverIds } } });
    }
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  const altAuth = () => ({ Authorization: `Bearer ${altToken}` });

  // ── GET /deliveries/me/current ─────────────────────────────────────────────

  describe('GET /api/v1/deliveries/me/current', () => {
    it('200 — returns the IN_PROGRESS delivery for the authenticated driver', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/deliveries/me/current')
        .set(auth())
        .expect(200);

      expect(res.body.id).toBe(inProgressDeliveryId);
      expect(res.body.status).toBe('IN_PROGRESS');
      expect(res.body.driverId).toBe(driverId);
      expect(Array.isArray(res.body.orderItems)).toBe(true);
    });

    it('404 — returns Not Found when the driver has no IN_PROGRESS delivery', async () => {
      // alt driver has only a PENDING delivery, no IN_PROGRESS
      await request(app.getHttpServer())
        .get('/api/v1/deliveries/me/current')
        .set(altAuth())
        .expect(404);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer()).get('/api/v1/deliveries/me/current').expect(401);
    });
  });

  // ── GET /deliveries/me/next ────────────────────────────────────────────────

  describe('GET /api/v1/deliveries/me/next', () => {
    it('200 — returns the oldest PENDING delivery in queue', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/deliveries/me/next')
        .set(auth())
        .expect(200);

      expect(res.body.status).toBe('PENDING');
      expect(res.body.driverId).toBe(driverId);
      // Should be one of the two PENDING deliveries (oldest first)
      expect([pendingDeliveryId, statusTestDeliveryId]).toContain(res.body.id as string);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer()).get('/api/v1/deliveries/me/next').expect(401);
    });
  });

  // ── GET /deliveries/:id ────────────────────────────────────────────────────

  describe('GET /api/v1/deliveries/:id', () => {
    it('200 — returns delivery with order items and correct lineTotals', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${pendingDeliveryId}`)
        .set(auth())
        .expect(200);

      expect(res.body.id).toBe(pendingDeliveryId);
      expect(Array.isArray(res.body.orderItems)).toBe(true);
      expect(res.body.orderItems).toHaveLength(2);

      // Verify lineTotal computation: (basePrice + extraPrice) × quantity
      const pizza = (res.body.orderItems as { name: string; lineTotal: number }[]).find(
        (i) => i.name === 'Ham and Cheese Pizza 11 inch',
      );
      const soda = (res.body.orderItems as { name: string; lineTotal: number }[]).find(
        (i) => i.name === 'Soda',
      );
      expect(pizza?.lineTotal).toBe(14); // (12 + 2) × 1
      expect(soda?.lineTotal).toBe(6);   // (3 + 0) × 2
    });

    it('404 — requesting another driver\'s delivery returns Not Found (not 403)', async () => {
      // altDriver requests primary driver's delivery — must 404, not 403 or 200
      await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${pendingDeliveryId}`)
        .set(altAuth())
        .expect(404);
    });

    it('404 — nonexistent delivery ID returns Not Found', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/deliveries/nonexistent-id')
        .set(auth())
        .expect(404);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${pendingDeliveryId}`)
        .expect(401);
    });
  });

  // ── GET /deliveries/:id/route (with cache verification) ───────────────────

  describe('GET /api/v1/deliveries/:id/route', () => {
    it('200 — returns route data with etaMinutes, distanceKm, polyline, trafficAlert', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${inProgressDeliveryId}/route`)
        .set(auth())
        .expect(200);

      expect(typeof res.body.etaMinutes).toBe('number');
      expect(typeof res.body.distanceKm).toBe('number');
      expect(typeof res.body.polyline).toBe('string');
      expect(res.body).toHaveProperty('trafficAlert');
    });

    it('second call within 30s hits the cache — MockRouteProvider is NOT called again', async () => {
      // Invalidate to guarantee a fresh cache state for this test
      await cache.invalidate(`route:${inProgressDeliveryId}`);

      const spy = jest.spyOn(mockProvider, 'getRoute');

      // First call — cache miss, provider is invoked
      await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${inProgressDeliveryId}/route`)
        .set(auth())
        .expect(200);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockClear();

      // Second call within 30s — cache hit, provider must NOT be invoked
      await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${inProgressDeliveryId}/route`)
        .set(auth())
        .expect(200);
      expect(spy).not.toHaveBeenCalled();

      spy.mockRestore();
    });

    it('404 — requesting another driver\'s delivery route returns Not Found', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${inProgressDeliveryId}/route`)
        .set(altAuth())
        .expect(404);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${inProgressDeliveryId}/route`)
        .expect(401);
    });
  });

  // ── PATCH /deliveries/:id/status ──────────────────────────────────────────
  // Uses statusTestDeliveryId (starts PENDING) and walks it through all valid transitions.

  describe('PATCH /api/v1/deliveries/:id/status', () => {
    it('400 — invalid enum value is rejected by ValidationPipe', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${statusTestDeliveryId}/status`)
        .set(auth())
        .send({ status: 'FLYING' })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('400 — PENDING → DELIVERED (skipping two states) is rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${statusTestDeliveryId}/status`)
        .set(auth())
        .send({ status: 'DELIVERED' })
        .expect(400);
    });

    it('400 — PENDING → AT_DOOR (skipping one state) is rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${statusTestDeliveryId}/status`)
        .set(auth())
        .send({ status: 'AT_DOOR' })
        .expect(400);
    });

    it('404 — another driver cannot update this delivery', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${statusTestDeliveryId}/status`)
        .set(altAuth())
        .send({ status: 'IN_PROGRESS' })
        .expect(404);
    });

    it('200 — PENDING → IN_PROGRESS (valid first transition)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${statusTestDeliveryId}/status`)
        .set(auth())
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('400 — IN_PROGRESS → PENDING (backwards) is rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${statusTestDeliveryId}/status`)
        .set(auth())
        .send({ status: 'PENDING' })
        .expect(400);
    });

    it('400 — IN_PROGRESS → DELIVERED (skipping AT_DOOR) is rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${statusTestDeliveryId}/status`)
        .set(auth())
        .send({ status: 'DELIVERED' })
        .expect(400);
    });

    it('200 — IN_PROGRESS → AT_DOOR (valid second transition)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${statusTestDeliveryId}/status`)
        .set(auth())
        .send({ status: 'AT_DOOR' })
        .expect(200);

      expect(res.body.status).toBe('AT_DOOR');
    });

    it('200 — AT_DOOR → DELIVERED (valid final transition) — deliveredAt is stamped', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${statusTestDeliveryId}/status`)
        .set(auth())
        .send({ status: 'DELIVERED' })
        .expect(200);

      expect(res.body.status).toBe('DELIVERED');
      expect(res.body.deliveredAt).not.toBeNull();
    });

    it('400 — DELIVERED → any status is rejected (terminal state)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${statusTestDeliveryId}/status`)
        .set(auth())
        .send({ status: 'IN_PROGRESS' })
        .expect(400);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${statusTestDeliveryId}/status`)
        .send({ status: 'IN_PROGRESS' })
        .expect(401);
    });
  });
});
