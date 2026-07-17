import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app-config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const RUN_ID = Date.now().toString();
const testEmail = (n: number) => `e2e-shifts-${RUN_ID}-${n}@test.com`;

// These tests are intentionally stateful in sequence:
//   startShift → getCurrentShift → stopShift (cross-driver 404 first) → history
// Jest executes describe blocks within a file in order.

describe('Shifts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let accessToken: string;
  let driverId: string;
  let altToken: string; // second driver for cross-driver security tests

  const createdDriverIds: string[] = [];
  let activeShiftId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = module.get(PrismaService);

    // Primary driver
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        workId: `WK-SHF-${RUN_ID}`,
        firstName: 'Jane',
        lastName: 'Doe',
        email: testEmail(1),
        password: 'Password123!',
      });
    accessToken = signup.body.accessToken as string;
    driverId = signup.body.driver.id as string;
    createdDriverIds.push(driverId);

    // Alternate driver (used to assert cross-driver NotFoundException)
    const alt = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        workId: `WK-SHF-ALT-${RUN_ID}`,
        firstName: 'Alt',
        lastName: 'Driver',
        email: testEmail(2),
        password: 'Password123!',
      });
    altToken = alt.body.accessToken as string;
    createdDriverIds.push(alt.body.driver.id as string);
  });

  afterAll(async () => {
    if (createdDriverIds.length) {
      // Shifts must be deleted before drivers (FK constraint, no cascade)
      await prisma.shift.deleteMany({ where: { driverId: { in: createdDriverIds } } });
      await prisma.transaction.deleteMany({ where: { driverId: { in: createdDriverIds } } });
      await prisma.notification.deleteMany({ where: { driverId: { in: createdDriverIds } } });
      await prisma.driver.deleteMany({ where: { id: { in: createdDriverIds } } });
    }
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  const altAuth = () => ({ Authorization: `Bearer ${altToken}` });

  // ── POST /shifts/start ─────────────────────────────────────────────────────

  describe('POST /api/v1/shifts/start', () => {
    it('201 — successfully starts a new shift', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/shifts/start')
        .set(auth())
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.driverId).toBe(driverId);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body).toHaveProperty('startedAt');
      expect(res.body.endedAt).toBeNull();
      expect(res.body.earnings).toBe(0);
      expect(res.body.tips).toBe(0);
      expect(res.body.deliveriesCompleted).toBe(0);

      activeShiftId = res.body.id as string;
    });

    it('409 — starting a second shift while one is already active', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/shifts/start')
        .set(auth())
        .expect(409);

      expect(res.body.statusCode).toBe(409);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer()).post('/api/v1/shifts/start').expect(401);
    });
  });

  // ── GET /shifts/me/current (while shift is active) ─────────────────────────

  describe('GET /api/v1/shifts/me/current — active shift', () => {
    it('200 — returns the active shift resolved from JWT', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/shifts/me/current')
        .set(auth())
        .expect(200);

      expect(res.body.id).toBe(activeShiftId);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.driverId).toBe(driverId);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer()).get('/api/v1/shifts/me/current').expect(401);
    });
  });

  // ── POST /shifts/:id/stop ──────────────────────────────────────────────────

  describe('POST /api/v1/shifts/:id/stop', () => {
    it('404 — a different driver cannot stop another driver\'s shift', async () => {
      // altDriver attempts to stop the primary driver's shift — should 404, not 403,
      // to avoid leaking that the shift ID exists at all.
      await request(app.getHttpServer())
        .post(`/api/v1/shifts/${activeShiftId}/stop`)
        .set(altAuth())
        .expect(404);
    });

    it('200 — successfully stops the active shift with computed totals', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/shifts/${activeShiftId}/stop`)
        .set(auth())
        .expect(200);

      expect(res.body.id).toBe(activeShiftId);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.endedAt).not.toBeNull();
      // No deliveries linked yet — deliveries module not implemented
      expect(res.body.earnings).toBe(0);
      expect(res.body.tips).toBe(0);
      expect(res.body.deliveriesCompleted).toBe(0);
    });

    it('409 — stopping an already-completed shift returns Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/shifts/${activeShiftId}/stop`)
        .set(auth())
        .expect(409);

      expect(res.body.statusCode).toBe(409);
    });

    it('404 — stopping a nonexistent shift ID returns Not Found', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/shifts/nonexistent-id/stop')
        .set(auth())
        .expect(404);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/shifts/${activeShiftId}/stop`)
        .expect(401);
    });
  });

  // ── GET /shifts/me/current (after shift stopped) ───────────────────────────

  describe('GET /api/v1/shifts/me/current — after shift is stopped', () => {
    it('404 — no active shift exists after stopping', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/shifts/me/current')
        .set(auth())
        .expect(404);
    });
  });

  // ── GET /shifts/me/history ─────────────────────────────────────────────────

  describe('GET /api/v1/shifts/me/history', () => {
    it('200 — returns completed shifts for the authenticated driver', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/shifts/me/history')
        .set(auth())
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      const completed = (res.body as { id: string; status: string; driverId: string }[]);
      expect(completed.every((s) => s.status === 'COMPLETED')).toBe(true);
      expect(completed[0].driverId).toBe(driverId);
    });

    it('200 — returns empty array for a driver who has never completed a shift', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/shifts/me/history')
        .set(altAuth())
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer()).get('/api/v1/shifts/me/history').expect(401);
    });
  });
});
