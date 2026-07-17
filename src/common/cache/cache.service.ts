import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// ─── TTL reference ────────────────────────────────────────────────────────────
//
// Two caching tiers are in use across the API:
//
//   team:list        3600 s (1 hour)   Teams are seeded reference data; they
//                                      change only via an admin action (which
//                                      falls outside the assessment scope).
//                                      A 1-hour TTL means mobile clients see
//                                      fresh data after onboarding without
//                                      hammering the DB on every screen load.
//
//   route:{id}       30 s              RouteProvider results (ETA / distance /
//                                      traffic) are polled by the tracking
//                                      screen every few seconds. 30 s balances
//                                      freshness with avoiding repeated calls to
//                                      the (mocked / future real) maps provider.
//
// ─── Fail-open design ─────────────────────────────────────────────────────────
//
// Every Redis operation is wrapped in a try/catch that logs a WARN and returns
// a safe default (null / void / false) instead of propagating the error.
//
// Consequence: any caller that uses cache-aside logic (check cache → on miss
// query DB / provider → write cache) automatically falls through to its source
// of truth when Redis is unreachable. The request succeeds, just uncached.
//
// The /health endpoint's ping() still returns false during an outage, so
// monitoring/alerting can detect the degradation without breaking the API.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.client = new Redis(this.config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
    });
    this.client.on('error', (err: Error) =>
      this.logger.error('Redis connection error', err.message),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (err) {
      // Fail open: treat any Redis error as a cache miss.
      this.logger.warn(`Cache get failed for key "${key}": ${String(err)}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      // Fail open: a failed write is logged but never surfaced to the caller.
      this.logger.warn(`Cache set failed for key "${key}": ${String(err)}`);
    }
  }

  async invalidate(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      // Fail open: a failed delete is logged but never surfaced to the caller.
      this.logger.warn(`Cache invalidate failed for key "${key}": ${String(err)}`);
    }
  }

  async ping(): Promise<boolean> {
    try {
      const reply = await this.client.ping();
      return reply === 'PONG';
    } catch {
      return false;
    }
  }
}
