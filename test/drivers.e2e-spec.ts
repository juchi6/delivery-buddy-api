import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app-config';
import { AppModule } from '../src/app.module';
import { CacheService } from '../src/common/cache/cache.service';
import { DriversRepository } from '../src/drivers/drivers.repository';
import { PrismaService } from '../src/prisma/prisma.service';

const RUN_ID = Date.now().toString();
const testEmail = (n: number) => `e2e-drivers-${RUN_ID}-${n}@test.com`;

describe('Drivers (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cache: CacheService;
  let driverRepo: DriversRepository;

  let accessToken: string;
  let driverId: string;
  let teamId: string;

  const createdDriverIds: string[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = module.get(PrismaService);
    cache = module.get(CacheService);
    driverRepo = module.get(DriversRepository);

    // Seed a team so GET /teams has data
    const team = await prisma.team.create({ data: { name: `E2E Team ${RUN_ID}` } });
    teamId = team.id;

    // Invalidate stale cache so these tests start clean
    await cache.invalidate('team:list');

    // Create a driver and get a JWT for authenticated requests
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        workId: `WK-DRV-${RUN_ID}`,
        firstName: 'Jane',
        lastName: 'Doe',
        email: testEmail(1),
        password: 'Password123!',
      });
    accessToken = signup.body.accessToken as string;
    driverId = signup.body.driver.id as string;
    createdDriverIds.push(driverId);
  });

  afterAll(async () => {
    await cache.invalidate('team:list');
    if (createdDriverIds.length) {
      await prisma.transaction.deleteMany({ where: { driverId: { in: createdDriverIds } } });
      await prisma.notification.deleteMany({ where: { driverId: { in: createdDriverIds } } });
      await prisma.driver.deleteMany({ where: { id: { in: createdDriverIds } } });
    }
    await prisma.team.deleteMany({ where: { name: { startsWith: `E2E Team ${RUN_ID}` } } });
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  // ── GET /teams ─────────────────────────────────────────────────────────────

  describe('GET /api/v1/teams', () => {
    it('200 — returns an array of teams', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/teams')
        .set(auth())
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const names = (res.body as { name: string }[]).map((t) => t.name);
      expect(names).toContain(`E2E Team ${RUN_ID}`);
    });

    it('second call hits the cache, not the database', async () => {
      const spy = jest.spyOn(driverRepo, 'findAllTeams');

      // First call (after invalidation in beforeAll) may or may not hit DB depending on state —
      // call it once to prime the cache, then reset the spy
      await request(app.getHttpServer()).get('/api/v1/teams').set(auth()).expect(200);
      spy.mockClear();

      // Second call must use the cache
      await request(app.getHttpServer()).get('/api/v1/teams').set(auth()).expect(200);

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer()).get('/api/v1/teams').expect(401);
    });
  });

  // ── PATCH /drivers/me/onboarding ──────────────────────────────────────────

  describe('PATCH /api/v1/drivers/me/onboarding', () => {
    it('200 — partial update applies only provided fields', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/drivers/me/onboarding')
        .set(auth())
        .send({ teamId, transportationType: 'BICYCLE' })
        .expect(200);

      expect(res.body.teamId).toBe(teamId);
      expect(res.body.transportationType).toBe('BICYCLE');
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('200 — subsequent step adds vehicleNumber without touching teamId', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/drivers/me/onboarding')
        .set(auth())
        .send({ vehicleNumber: 'ABC-1234' })
        .expect(200);

      expect(res.body.vehicleNumber).toBe('ABC-1234');
      expect(res.body.teamId).toBe(teamId); // preserved from previous step
    });

    it('404 — invalid teamId returns Not Found', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/drivers/me/onboarding')
        .set(auth())
        .send({ teamId: 'nonexistent-team-id' })
        .expect(404);
    });

    it('400 — invalid transportationType enum is rejected', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/drivers/me/onboarding')
        .set(auth())
        .send({ transportationType: 'JETPACK' })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/drivers/me/onboarding')
        .send({ vehicleNumber: 'X' })
        .expect(401);
    });
  });

  // ── GET /drivers/me/onboarding-status ─────────────────────────────────────

  describe('GET /api/v1/drivers/me/onboarding-status', () => {
    it('200 — reflects current completion state (all required fields present after above steps)', async () => {
      // After the onboarding PATCH tests above, all required fields should be set
      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers/me/onboarding-status')
        .set(auth())
        .expect(200);

      expect(res.body).toHaveProperty('isComplete');
      expect(res.body).toHaveProperty('missingFields');
      expect(res.body).toHaveProperty('completedFields');
      expect(Array.isArray(res.body.missingFields)).toBe(true);
      expect(Array.isArray(res.body.completedFields)).toBe(true);
    });

    it('correctly marks missing fields on a brand-new driver (no onboarding yet)', async () => {
      // Create a fresh driver with no onboarding data
      const fresh = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          workId: `WK-FRESH-${RUN_ID}`,
          firstName: 'Fresh',
          lastName: 'Driver',
          email: testEmail(2),
          password: 'Password123!',
        });
      createdDriverIds.push(fresh.body.driver.id as string);
      const freshToken = fresh.body.accessToken as string;

      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers/me/onboarding-status')
        .set({ Authorization: `Bearer ${freshToken}` })
        .expect(200);

      // teamId, transportationType, vehicleNumber should be missing
      expect(res.body.missingFields).toContain('teamId');
      expect(res.body.missingFields).toContain('transportationType');
      expect(res.body.missingFields).toContain('vehicleNumber');
      // workId, firstName, lastName were set at signup
      expect(res.body.completedFields).toContain('workId');
      expect(res.body.completedFields).toContain('firstName');
      expect(res.body.completedFields).toContain('lastName');
      expect(res.body.isComplete).toBe(false);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/drivers/me/onboarding-status')
        .expect(401);
    });
  });

  // ── GET /drivers/me ────────────────────────────────────────────────────────

  describe('GET /api/v1/drivers/me', () => {
    it('200 — returns the driver profile resolved from JWT (not URL param)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers/me')
        .set(auth())
        .expect(200);

      expect(res.body.id).toBe(driverId);
      expect(res.body.email).toBe(testEmail(1));
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).toHaveProperty('level');
      expect(res.body).toHaveProperty('commissionRate');
      expect(res.body).toHaveProperty('transportationType');
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer()).get('/api/v1/drivers/me').expect(401);
    });
  });

  // ── PATCH /drivers/me ─────────────────────────────────────────────────────

  describe('PATCH /api/v1/drivers/me', () => {
    it('200 — updates editable profile fields', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/drivers/me')
        .set(auth())
        .send({ firstName: 'Updated', lastName: 'Name' })
        .expect(200);

      expect(res.body.firstName).toBe('Updated');
      expect(res.body.lastName).toBe('Name');
      expect(res.body.email).toBe(testEmail(1)); // unchanged
    });

    it('400 — invalid avatarUrl is rejected', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/drivers/me')
        .set(auth())
        .send({ avatarUrl: 'not-a-url' })
        .expect(400);
    });

    it('400 — unknown field is rejected (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/drivers/me')
        .set(auth())
        .send({ level: 99 }) // not in UpdateDriverDto
        .expect(400);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/drivers/me')
        .send({ firstName: 'X' })
        .expect(401);
    });
  });

  // ── Stub endpoints ─────────────────────────────────────────────────────────

  describe('stub endpoints', () => {
    it('GET /drivers/me/billing-method — 200 placeholder', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers/me/billing-method')
        .set(auth())
        .expect(200);
      expect(res.body.configured).toBe(false);
      expect(res.body.message).toBeDefined();
    });

    it('PATCH /drivers/me/billing-method — 200 placeholder', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/drivers/me/billing-method')
        .set(auth())
        .send({})
        .expect(200);
      expect(res.body.configured).toBe(false);
    });

    it('GET /drivers/me/notification-settings — 200 placeholder', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers/me/notification-settings')
        .set(auth())
        .expect(200);
      expect(res.body.configured).toBe(false);
    });

    it('PATCH /drivers/me/notification-settings — 200 placeholder', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/drivers/me/notification-settings')
        .set(auth())
        .send({})
        .expect(200);
      expect(res.body.configured).toBe(false);
    });

    it('GET /drivers/me/fuel-settings — 200 placeholder (out of scope)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers/me/fuel-settings')
        .set(auth())
        .expect(200);
      expect(res.body.configured).toBe(false);
    });
  });
});
