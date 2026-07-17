import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';

// CacheService wraps ioredis. These tests exercise:
//   1. Fail-open behavior — every Redis method throws ECONNREFUSED; the service
//      must swallow the error and return safe defaults so callers fall through
//      to their DB / provider instead of getting a 500.
//   2. Normal happy-path — set/get/invalidate round-trips against real Redis
//      (requires Redis to be running, same as the e2e suite).

describe('CacheService', () => {
  let service: CacheService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: () => process.env.REDIS_URL ?? 'redis://localhost:6379',
          },
        },
      ],
    }).compile();

    service = module.get(CacheService);
    service.onModuleInit();
  });

  afterEach(async () => {
    // Restore any spies so they don't bleed into the next test's client.
    jest.restoreAllMocks();
    try {
      await service.onModuleDestroy();
    } catch {
      // Redis may not be reachable in some CI configurations — ignore quit errors.
    }
  });

  // ── Fail-open behavior ─────────────────────────────────────────────────────
  // Simulate a Redis outage by making every low-level command throw.
  // The service must NOT propagate the error — callers see only safe defaults.

  describe('fail-open: every Redis operation throws ECONNREFUSED', () => {
    const CONNECTION_ERROR = new Error('ECONNREFUSED 127.0.0.1:6379');

    beforeEach(() => {
      // Access the private Redis client and spy on the four command methods.
      // Using (service as any) is the accepted pattern for testing private members.
      const client = (service as any).client as Record<string, jest.Mock>;
      jest.spyOn(client, 'get').mockRejectedValue(CONNECTION_ERROR);
      jest.spyOn(client, 'set').mockRejectedValue(CONNECTION_ERROR);
      jest.spyOn(client, 'del').mockRejectedValue(CONNECTION_ERROR);
      jest.spyOn(client, 'ping').mockRejectedValue(CONNECTION_ERROR);
    });

    it('get() returns null — callers treat this as a cache miss and fall through to the DB', async () => {
      const result = await service.get<string>('any-key');
      expect(result).toBeNull();
    });

    it('set() resolves without throwing — a failed cache write never breaks the response', async () => {
      await expect(service.set('any-key', { x: 1 }, 60)).resolves.toBeUndefined();
    });

    it('invalidate() resolves without throwing — a failed delete never breaks the response', async () => {
      await expect(service.invalidate('any-key')).resolves.toBeUndefined();
    });

    it('ping() returns false — health check correctly reports Redis as unreachable', async () => {
      const ok = await service.ping();
      expect(ok).toBe(false);
    });

    it('get() after a failed set() still returns null (consistent miss — no stale data)', async () => {
      await service.set('stale-key', 'value', 60); // fails silently
      const result = await service.get<string>('stale-key');
      expect(result).toBeNull(); // nothing was written, so nothing is returned
    });
  });

  // ── Normal happy-path ──────────────────────────────────────────────────────
  // These tests require a live Redis connection (same as the e2e suite).

  describe('normal operation (Redis responding)', () => {
    const UNIQUE = `test:cache-spec:${Date.now()}`;

    afterEach(async () => {
      // Clean up keys written during happy-path tests.
      await service.invalidate(UNIQUE);
      await service.invalidate(`${UNIQUE}:del`);
    });

    it('set() then get() round-trips any JSON-serialisable value', async () => {
      await service.set(UNIQUE, { hello: 'world', n: 42 }, 10);
      const result = await service.get<{ hello: string; n: number }>(UNIQUE);
      expect(result).toEqual({ hello: 'world', n: 42 });
    });

    it('get() returns null for a key that does not exist', async () => {
      const result = await service.get<string>(`nonexistent:${Date.now()}`);
      expect(result).toBeNull();
    });

    it('invalidate() removes the key so subsequent get() returns null', async () => {
      await service.set(`${UNIQUE}:del`, 'value', 10);
      await service.invalidate(`${UNIQUE}:del`);
      const result = await service.get<string>(`${UNIQUE}:del`);
      expect(result).toBeNull();
    });

    it('ping() returns true when Redis is reachable', async () => {
      const ok = await service.ping();
      expect(ok).toBe(true);
    });
  });
});
