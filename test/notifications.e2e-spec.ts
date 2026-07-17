import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app-config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const RUN_ID = Date.now().toString();
const testEmail = (n: number) => `e2e-notif-${RUN_ID}-${n}@test.com`;

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let accessToken: string;
  let driverId: string;
  let altToken: string;
  let altDriverId: string;

  // IDs of seeded notifications for cross-driver tests
  let notifId1: string;
  let notifId2: string;
  let notifId3: string;
  let altNotifId: string;

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
        workId: `WK-NTF-${RUN_ID}`,
        firstName: 'Notif',
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
        workId: `WK-NTF-ALT-${RUN_ID}`,
        firstName: 'Alt',
        lastName: 'Driver',
        email: testEmail(2),
        password: 'Password123!',
      });
    altToken = alt.body.accessToken as string;
    altDriverId = alt.body.driver.id as string;
    createdDriverIds.push(altDriverId);

    // ── Seed notifications directly via Prisma ────────────────────────────────
    // Deliberately sleep 1ms between creates so createdAt timestamps differ and
    // ordering assertions are stable.
    const n1 = await prisma.notification.create({
      data: { driverId, type: 'new_delivery', body: 'Delivery #1 assigned' },
    });
    notifId1 = n1.id;

    // Prisma's default clock resolution may produce identical timestamps for rapid
    // sequential inserts; force ordering by overriding createdAt.
    const n2 = await prisma.notification.create({
      data: {
        driverId,
        type: 'shift_summary',
        body: 'Great shift!',
        createdAt: new Date(Date.now() + 1),
      },
    });
    notifId2 = n2.id;

    const n3 = await prisma.notification.create({
      data: {
        driverId,
        type: 'withdrawal_complete',
        body: 'Payout sent',
        createdAt: new Date(Date.now() + 2),
      },
    });
    notifId3 = n3.id;

    const altN = await prisma.notification.create({
      data: { driverId: altDriverId, type: 'new_delivery', body: 'Alt delivery' },
    });
    altNotifId = altN.id;
  });

  afterAll(async () => {
    if (createdDriverIds.length) {
      await prisma.notification.deleteMany({ where: { driverId: { in: createdDriverIds } } });
      await prisma.driver.deleteMany({ where: { id: { in: createdDriverIds } } });
    }
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  const altAuth = () => ({ Authorization: `Bearer ${altToken}` });

  // ── GET /notifications/me ──────────────────────────────────────────────────

  describe('GET /api/v1/notifications/me', () => {
    it('200 — returns all notifications for the authenticated driver', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/me')
        .set(auth())
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
      // All belong to this driver
      for (const n of res.body.data as { driverId: string }[]) {
        expect(n.driverId).toBe(driverId);
      }
    });

    it('200 — notifications are ordered newest first (createdAt descending)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/me')
        .set(auth())
        .expect(200);

      const dates = (res.body.data as { createdAt: string }[]).map((n) =>
        new Date(n.createdAt).getTime(),
      );
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
      // Newest (n3) should be first
      expect((res.body.data as { id: string }[])[0].id).toBe(notifId3);
    });

    it('200 — pagination: page=1 limit=2 returns 2 items, total=3', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/me?page=1&limit=2')
        .set(auth())
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(2);
    });

    it('200 — pagination: page=2 limit=2 returns the remaining 1 item', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/me?page=2&limit=2')
        .set(auth())
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(3);
    });

    it('400 — limit exceeding 100 is rejected', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/notifications/me?limit=101')
        .set(auth())
        .expect(400);
    });

    it('200 — alt driver only sees their own notifications', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/me')
        .set(altAuth())
        .expect(200);

      expect(res.body.total).toBe(1);
      expect((res.body.data as { id: string }[])[0].id).toBe(altNotifId);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer()).get('/api/v1/notifications/me').expect(401);
    });
  });

  // ── PATCH /notifications/:id/read ─────────────────────────────────────────

  describe('PATCH /api/v1/notifications/:id/read', () => {
    it('200 — marks notification as read and returns the updated DTO', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notifId1}/read`)
        .set(auth())
        .expect(200);

      expect(res.body.id).toBe(notifId1);
      expect(res.body.isRead).toBe(true);
    });

    it('GET reflects isRead=true after marking', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/me')
        .set(auth())
        .expect(200);

      const updated = (res.body.data as { id: string; isRead: boolean }[]).find(
        (n) => n.id === notifId1,
      );
      expect(updated?.isRead).toBe(true);
      // Other notifications remain unread
      const unread = (res.body.data as { id: string; isRead: boolean }[]).filter(
        (n) => n.id !== notifId1,
      );
      for (const n of unread) {
        expect(n.isRead).toBe(false);
      }
    });

    it('200 — marking an already-read notification is idempotent', async () => {
      // notifId1 was already marked in the previous test
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notifId1}/read`)
        .set(auth())
        .expect(200);

      expect(res.body.isRead).toBe(true);
    });

    it('404 — marking another driver\'s notification returns 404 not 403', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${altNotifId}/read`)
        .set(auth())
        .expect(404);
    });

    it('404 — non-existent notification ID returns 404', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/notifications/nonexistent-id/read')
        .set(auth())
        .expect(404);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notifId2}/read`)
        .expect(401);
    });

    it('200 — marking remaining notifications one by one clears them all', async () => {
      for (const id of [notifId2, notifId3]) {
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/notifications/${id}/read`)
          .set(auth())
          .expect(200);
        expect(res.body.isRead).toBe(true);
      }

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/me')
        .set(auth())
        .expect(200);

      const allRead = (listRes.body.data as { isRead: boolean }[]).every((n) => n.isRead);
      expect(allRead).toBe(true);
    });
  });
});
