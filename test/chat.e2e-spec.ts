import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app-config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const RUN_ID = Date.now().toString();
const testEmail = (n: number) => `e2e-chat-${RUN_ID}-${n}@test.com`;

// Tests are stateful in sequence:
//   seed delivery → read empty thread → post messages → verify order → cross-driver 404

describe('Chat (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let accessToken: string;
  let driverId: string;
  let altToken: string;
  let altDriverId: string;

  let deliveryId: string;       // belongs to primary driver
  let altDeliveryId: string;    // belongs to alt driver — used for cross-driver tests

  const createdDriverIds: string[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = module.get(PrismaService);

    // ── Primary driver ────────────────────────────────────────────────────────
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        workId: `WK-CHT-${RUN_ID}`,
        firstName: 'Chat',
        lastName: 'Driver',
        email: testEmail(1),
        password: 'Password123!',
      });
    accessToken = signup.body.accessToken as string;
    driverId = signup.body.driver.id as string;
    createdDriverIds.push(driverId);

    // ── Alternate driver ──────────────────────────────────────────────────────
    const alt = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        workId: `WK-CHT-ALT-${RUN_ID}`,
        firstName: 'Alt',
        lastName: 'Driver',
        email: testEmail(2),
        password: 'Password123!',
      });
    altToken = alt.body.accessToken as string;
    altDriverId = alt.body.driver.id as string;
    createdDriverIds.push(altDriverId);

    // ── Seed deliveries directly via Prisma ───────────────────────────────────
    const base = {
      pickupName: 'Shop',
      pickupAddress: '1 Main St',
      destinationCustomerName: 'Customer',
      destinationAddress: '2 Oak Ave',
      destinationPhone: '+1234567890',
      totalAmount: 20,
      driverEarning: 5,
      tipAmount: 1,
      paymentMethod: 'Card',
    };

    const del = await prisma.delivery.create({
      data: { ...base, orderNumber: `ORD-CHT-${RUN_ID}`, status: DeliveryStatus.IN_PROGRESS, driverId },
    });
    deliveryId = del.id;

    const altDel = await prisma.delivery.create({
      data: { ...base, orderNumber: `ORD-CHT-ALT-${RUN_ID}`, status: DeliveryStatus.PENDING, driverId: altDriverId },
    });
    altDeliveryId = altDel.id;
  });

  afterAll(async () => {
    if (createdDriverIds.length) {
      // Messages cascade from Delivery on delete, so delivery cleanup covers messages too.
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

  // ── GET /deliveries/:id/messages ───────────────────────────────────────────

  describe('GET /api/v1/deliveries/:id/messages', () => {
    it('200 — returns empty array when no messages exist yet', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${deliveryId}/messages`)
        .set(auth())
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it('404 — cross-driver access returns 404 not 403 (no existence leaking)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${altDeliveryId}/messages`)
        .set(auth())
        .expect(404);
    });

    it('404 — non-existent delivery ID returns 404', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/deliveries/nonexistent-id/messages')
        .set(auth())
        .expect(404);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${deliveryId}/messages`)
        .expect(401);
    });
  });

  // ── POST /deliveries/:id/messages ──────────────────────────────────────────

  describe('POST /api/v1/deliveries/:id/messages', () => {
    it('201 — creates a message and returns the MessageDto', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${deliveryId}/messages`)
        .set(auth())
        .send({ body: 'Arrived at pickup' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.deliveryId).toBe(deliveryId);
      expect(res.body.senderId).toBe(driverId);
      expect(res.body.senderType).toBe('DRIVER');
      expect(res.body.body).toBe('Arrived at pickup');
      expect(res.body.attachmentUrl).toBeNull();
      expect(res.body.sentAt).toBeDefined();
    });

    it('201 — message with optional attachmentUrl is stored correctly', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${deliveryId}/messages`)
        .set(auth())
        .send({ body: 'See photo', attachmentUrl: 'http://cdn.example.com/photo.png' })
        .expect(201);

      expect(res.body.attachmentUrl).toBe('http://cdn.example.com/photo.png');
    });

    it('400 — empty body string is rejected', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${deliveryId}/messages`)
        .set(auth())
        .send({ body: '' })
        .expect(400);
    });

    it('400 — missing body field is rejected', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${deliveryId}/messages`)
        .set(auth())
        .send({})
        .expect(400);
    });

    it('400 — body exceeding 2000 characters is rejected', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${deliveryId}/messages`)
        .set(auth())
        .send({ body: 'x'.repeat(2001) })
        .expect(400);
    });

    it('400 — invalid attachmentUrl (no protocol) is rejected', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${deliveryId}/messages`)
        .set(auth())
        .send({ body: 'check this', attachmentUrl: 'not-a-url' })
        .expect(400);
    });

    it('404 — cross-driver POST returns 404 not 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${altDeliveryId}/messages`)
        .set(auth())
        .send({ body: 'Hello from wrong driver' })
        .expect(404);
    });

    it('404 — non-existent delivery ID returns 404', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/deliveries/nonexistent-id/messages')
        .set(auth())
        .send({ body: 'Hello' })
        .expect(404);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${deliveryId}/messages`)
        .send({ body: 'Hello' })
        .expect(401);
    });
  });

  // ── Chronological ordering ─────────────────────────────────────────────────

  describe('GET messages — chronological ordering', () => {
    it('returns all messages ordered oldest-first (sentAt ascending)', async () => {
      // Two messages were posted in the previous describe block; a third is added here.
      await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${deliveryId}/messages`)
        .set(auth())
        .send({ body: 'Third message' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${deliveryId}/messages`)
        .set(auth())
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(3);

      const sentAts = (res.body as { sentAt: string }[]).map((m) => new Date(m.sentAt).getTime());
      for (let i = 1; i < sentAts.length; i++) {
        expect(sentAts[i]).toBeGreaterThanOrEqual(sentAts[i - 1]);
      }

      // First message body reflects posting order
      expect((res.body as { body: string }[])[0].body).toBe('Arrived at pickup');
    });

    it('alt driver can read their own delivery thread independently', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${altDeliveryId}/messages`)
        .set(altAuth())
        .send({ body: 'Alt driver message' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${altDeliveryId}/messages`)
        .set(altAuth())
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].senderId).toBe(altDriverId);
    });
  });
});
