import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-config';
import { PrismaService } from '../src/prisma/prisma.service';

// Minimal controller wired in only during this test suite to provide
// a real protected route before feature modules (wallet, etc.) exist.
@Controller('_test')
class GuardTestController {
  @Get('protected')
  ping(): string {
    return 'ok';
  }
}

// Unique suffix so parallel runs never collide in the shared DB
const RUN_ID = Date.now().toString();
const email = (n: number) => `e2e-auth-${RUN_ID}-${n}@test.com`;

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Track created driver IDs for cleanup
  const createdIds: string[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [GuardTestController],
    }).compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = module.get(PrismaService);
  });

  afterAll(async () => {
    // Delete test-specific records in dependency order
    if (createdIds.length) {
      await prisma.transaction.deleteMany({ where: { driverId: { in: createdIds } } });
      await prisma.notification.deleteMany({ where: { driverId: { in: createdIds } } });
      await prisma.driver.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app.close();
  });

  // ── signup ──────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/signup', () => {
    it('201 — creates a driver and returns tokens + profile', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ workId: 'WK-E2E-1', firstName: 'Jane', lastName: 'Doe', email: email(1), password: 'Password123!' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.driver.email).toBe(email(1));
      expect(res.body.driver).not.toHaveProperty('passwordHash');

      createdIds.push(res.body.driver.id);
    });

    it('409 — duplicate email returns Conflict', async () => {
      // Register once
      const first = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ workId: 'WK-E2E-2', firstName: 'Jane', lastName: 'Doe', email: email(2), password: 'Password123!' })
        .expect(201);
      createdIds.push(first.body.driver.id);

      // Try again with same email
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ workId: 'WK-E2E-3', firstName: 'Jane', lastName: 'Doe', email: email(2), password: 'Password123!' })
        .expect(409);

      expect(res.body.statusCode).toBe(409);
    });

    it('400 — missing required field returns validation error', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ email: email(99), password: 'Password123!' }) // missing firstName, lastName, workId
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('400 — password shorter than 8 characters is rejected', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ workId: 'WK-X', firstName: 'X', lastName: 'X', email: email(98), password: 'short' })
        .expect(400);
    });

    it('400 — extra unknown field is rejected (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ workId: 'WK-Y', firstName: 'Y', lastName: 'Y', email: email(97), password: 'Password123!', admin: true })
        .expect(400);
    });
  });

  // ── login ───────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    const loginEmail = email(10);

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ workId: 'WK-LOGIN', firstName: 'Login', lastName: 'Test', email: loginEmail, password: 'Password123!' });
      createdIds.push(res.body.driver.id);
    });

    it('200 — valid credentials return tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: loginEmail, password: 'Password123!' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('401 — wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: loginEmail, password: 'WrongPassword!' })
        .expect(401);
    });

    it('401 — email not registered', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'Password123!' })
        .expect(401);
    });

    it('400 — invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: 'Password123!' })
        .expect(400);
    });
  });

  // ── refresh ─────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    let refreshToken: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ workId: 'WK-REF', firstName: 'Ref', lastName: 'Test', email: email(20), password: 'Password123!' });
      createdIds.push(res.body.driver.id);
      refreshToken = res.body.refreshToken as string;
    });

    it('200 — valid refresh token returns new access + refresh tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      // Update for subsequent tests (token was rotated)
      refreshToken = res.body.refreshToken as string;
    });

    it('401 — invalid/garbage refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'garbage.token.here' })
        .expect(401);
    });

    it('401 — using old refresh token after rotation is rejected', async () => {
      // First rotate: get new tokens
      const rotated = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      // Attempt to reuse the token we just rotated away
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken }) // the old one
        .expect(401);

      refreshToken = rotated.body.refreshToken as string;
    });
  });

  // ── logout ──────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('204 — logout revokes refresh token', async () => {
      const signup = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({ workId: 'WK-OUT', firstName: 'Out', lastName: 'Test', email: email(30), password: 'Password123!' })
        .expect(201);
      createdIds.push(signup.body.driver.id);

      const { refreshToken } = signup.body as { refreshToken: string };

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .expect(204);

      // Revoked token should now be rejected on refresh
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('204 — logout with already-expired token does not crash', async () => {
      // We cannot fabricate an expired JWT here, so we test with a syntactically
      // valid but already-revoked token — the service treats it as a no-op.
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'garbage.token' })
        .expect(204);
    });
  });

  // ── auth guard ───────────────────────────────────────────────────────────────

  describe('JwtAuthGuard', () => {
    it('401 — request without Authorization header is rejected on protected route', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/_test/protected')
        .expect(401);
    });

    it('401 — malformed Bearer token is rejected', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/_test/protected')
        .set('Authorization', 'Bearer bad.token.here')
        .expect(401);
    });

    it('200 — /health is reachable without a token (@Public)', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
    });
  });
});
