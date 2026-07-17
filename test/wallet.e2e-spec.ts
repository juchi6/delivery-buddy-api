import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionType } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app-config';
import { AppModule } from '../src/app.module';
import { MockPayoutProvider } from '../src/wallet/providers/mock.payout.provider';
import { PrismaService } from '../src/prisma/prisma.service';

const RUN_ID = Date.now().toString();
const testEmail = (n: number) => `e2e-wallet-${RUN_ID}-${n}@test.com`;

describe('Wallet (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mockPayout: MockPayoutProvider;

  let accessToken: string;
  let driverId: string;
  let emptyToken: string; // driver with no transactions

  const createdDriverIds: string[] = [];

  // Seeded: EARNING 50, EARNING 30, TIP 10 → balance = 90
  const SEED_EARNINGS = 80; // 50 + 30
  const SEED_TIPS = 10;
  const SEED_BALANCE = SEED_EARNINGS + SEED_TIPS; // 90

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = module.get(PrismaService);
    mockPayout = module.get(MockPayoutProvider);

    // Primary driver
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        workId: `WK-WLT-${RUN_ID}`,
        firstName: 'Jane',
        lastName: 'Doe',
        email: testEmail(1),
        password: 'Password123!',
      });
    accessToken = signup.body.accessToken as string;
    driverId = signup.body.driver.id as string;
    createdDriverIds.push(driverId);

    // Empty driver (no transactions — for edge-case tests)
    const empty = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        workId: `WK-WLT-EMPTY-${RUN_ID}`,
        firstName: 'Empty',
        lastName: 'Wallet',
        email: testEmail(2),
        password: 'Password123!',
      });
    emptyToken = empty.body.accessToken as string;
    createdDriverIds.push(empty.body.driver.id as string);

    // Seed transactions for primary driver directly via Prisma
    // (no "admin create transaction" endpoint exists — this is test infrastructure)
    await prisma.transaction.createMany({
      data: [
        { driverId, type: TransactionType.EARNING, amount: 50 },
        { driverId, type: TransactionType.EARNING, amount: 30 },
        { driverId, type: TransactionType.TIP, amount: 10 },
      ],
    });
  });

  afterAll(async () => {
    if (createdDriverIds.length) {
      await prisma.transaction.deleteMany({ where: { driverId: { in: createdDriverIds } } });
      await prisma.shift.deleteMany({ where: { driverId: { in: createdDriverIds } } });
      await prisma.notification.deleteMany({ where: { driverId: { in: createdDriverIds } } });
      await prisma.driver.deleteMany({ where: { id: { in: createdDriverIds } } });
    }
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  const emptyAuth = () => ({ Authorization: `Bearer ${emptyToken}` });

  // ── GET /wallet/me ─────────────────────────────────────────────────────────

  describe('GET /api/v1/wallet/me', () => {
    it('200 — returns balance, earnings, tips, withdrawn, level, commissionRate', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/wallet/me')
        .set(auth())
        .expect(200);

      expect(res.body.totalEarnings).toBe(SEED_EARNINGS);
      expect(res.body.totalTips).toBe(SEED_TIPS);
      expect(res.body.totalWithdrawn).toBe(0);
      expect(res.body.balance).toBe(SEED_BALANCE);
      expect(typeof res.body.level).toBe('number');
      expect(typeof res.body.commissionRate).toBe('number');
    });

    it('balance invariant: balance === totalEarnings + totalTips − totalWithdrawn', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/wallet/me')
        .set(auth())
        .expect(200);

      const { balance, totalEarnings, totalTips, totalWithdrawn } = res.body as {
        balance: number;
        totalEarnings: number;
        totalTips: number;
        totalWithdrawn: number;
      };
      expect(balance).toBe(totalEarnings + totalTips - totalWithdrawn);
    });

    it('200 — returns zero balance for driver with no transactions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/wallet/me')
        .set(emptyAuth())
        .expect(200);

      expect(res.body.balance).toBe(0);
      expect(res.body.totalEarnings).toBe(0);
      expect(res.body.totalTips).toBe(0);
      expect(res.body.totalWithdrawn).toBe(0);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer()).get('/api/v1/wallet/me').expect(401);
    });
  });

  // ── GET /wallet/me/transactions ────────────────────────────────────────────

  describe('GET /api/v1/wallet/me/transactions', () => {
    it('200 — returns all transactions ordered newest first with correct total', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/wallet/me/transactions')
        .set(auth())
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);

      // Verify newest-first ordering: all items should have occurredAt in descending order
      const dates = (res.body.data as { occurredAt: string }[]).map((t) =>
        new Date(t.occurredAt).getTime(),
      );
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    });

    it('200 — pagination: page=1 limit=2 returns 2 items, total=3', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/wallet/me/transactions?page=1&limit=2')
        .set(auth())
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(2);
    });

    it('200 — pagination: page=2 limit=2 returns remaining 1 item', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/wallet/me/transactions?page=2&limit=2')
        .set(auth())
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(3);
    });

    it('400 — limit exceeding maximum (100) is rejected', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/wallet/me/transactions?limit=101')
        .set(auth())
        .expect(400);
    });

    it('200 — empty transactions list for driver with no transactions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/wallet/me/transactions')
        .set(emptyAuth())
        .expect(200);

      expect(res.body.data).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer()).get('/api/v1/wallet/me/transactions').expect(401);
    });
  });

  // ── POST /wallet/me/withdraw ───────────────────────────────────────────────
  // Tests that mutate state run after read-only tests.

  describe('POST /api/v1/wallet/me/withdraw', () => {
    it('400 — withdrawing more than balance is rejected (insufficient funds)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/wallet/me/withdraw')
        .set(auth())
        .send({ amount: SEED_BALANCE + 0.01 })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('400 — withdrawing 0 is rejected (IsPositive validator)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/wallet/me/withdraw')
        .set(auth())
        .send({ amount: 0 })
        .expect(400);
    });

    it('400 — withdrawing a negative amount is rejected', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/wallet/me/withdraw')
        .set(auth())
        .send({ amount: -10 })
        .expect(400);
    });

    it('400 — missing amount field is rejected', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/wallet/me/withdraw')
        .set(auth())
        .send({})
        .expect(400);
    });

    it('201 — successful withdrawal returns reference, transaction, and correct newBalance', async () => {
      const withdrawAmount = 50;
      const spy = jest.spyOn(mockPayout, 'withdraw');

      const res = await request(app.getHttpServer())
        .post('/api/v1/wallet/me/withdraw')
        .set(auth())
        .send({ amount: withdrawAmount })
        .expect(201);

      expect(typeof res.body.reference).toBe('string');
      expect(res.body.reference.length).toBeGreaterThan(0);
      expect(res.body.transaction.type).toBe('WITHDRAWAL');
      expect(res.body.transaction.amount).toBe(withdrawAmount);
      expect(res.body.newBalance).toBe(SEED_BALANCE - withdrawAmount); // 90 - 50 = 40

      expect(spy).toHaveBeenCalledWith(driverId, withdrawAmount);
      spy.mockRestore();
    });

    it('GET /wallet/me reflects the decreased balance after withdrawal', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/wallet/me')
        .set(auth())
        .expect(200);

      // 90 - 50 = 40
      expect(res.body.balance).toBe(SEED_BALANCE - 50);
      expect(res.body.totalWithdrawn).toBe(50);
      // Invariant still holds after withdrawal
      expect(res.body.balance).toBe(
        res.body.totalEarnings + res.body.totalTips - res.body.totalWithdrawn,
      );
    });

    it('400 — withdrawing more than the NEW balance after prior withdrawal is rejected', async () => {
      // Balance is now 40 after the withdrawal above
      await request(app.getHttpServer())
        .post('/api/v1/wallet/me/withdraw')
        .set(auth())
        .send({ amount: 40.01 })
        .expect(400);
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/wallet/me/withdraw')
        .send({ amount: 10 })
        .expect(401);
    });
  });
});
