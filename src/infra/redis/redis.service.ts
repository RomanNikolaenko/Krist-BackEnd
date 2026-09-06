import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from 'src/config/app-config.service';

/**
 * Redis holds disposable state only — rate-limit counters and short-lived
 * caches. Nothing here is authoritative: if the instance is wiped, users stay
 * signed in and permissions stay correct, because both live in PostgreSQL.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(config: AppConfigService) {
    this.client = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      // A rate limiter that hangs is worse than one that fails open on a
      // request; keep the timeout tight and let the caller decide.
      connectTimeout: 3000,
      // Keep trying in the background, backing off, so a cache that comes back
      // is picked up without a restart.
      retryStrategy: (attempt) => Math.min(attempt * 500, 10_000),
    });

    this.client.on('error', (error: Error) => {
      // Every failed reconnection fires this; log the first and stay quiet
      // afterwards rather than filling the log with the same line.
      if (!this.degraded) this.logger.error(`Redis error: ${error.message}`);
      this.degraded = true;
    });

    this.client.on('ready', () => {
      if (this.degraded) this.logger.log('Redis is back');
      this.degraded = false;
    });
  }

  private degraded = false;

  /**
   * Connecting is not allowed to stop the process from booting.
   *
   * Redis holds nothing authoritative here — rate-limit counters and caches —
   * and the limiter already fails open on a dead connection. Refusing to start
   * would take authentication offline along with the cache, which is the worse
   * of the two failures. It is logged as an error, not swallowed.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      this.logger.log('Redis connected');
    } catch (error) {
      this.logger.error(
        `Redis unavailable at boot — rate limiting is disabled until it returns: ${
          (error as Error).message
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    // disconnect(), not quit(): quit waits for a reply from a server that may
    // never answer, and shutdown would hang on it.
    this.client.disconnect();
  }

  /**
   * Counts one hit in a fixed window and reports where the caller stands.
   *
   * INCR then EXPIRE on first hit is atomic enough for this: the pipeline runs
   * on one connection, and a counter that loses its TTL would at worst reset a
   * window early, never grant extra attempts.
   */
  async hit(key: string, windowSeconds: number): Promise<{ count: number; ttl: number }> {
    const results = await this.client
      .multi()
      .incr(key)
      .expire(key, windowSeconds, 'NX')
      .ttl(key)
      .exec();

    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[2]?.[1] ?? windowSeconds);

    return { count, ttl: ttl < 0 ? windowSeconds : ttl };
  }

  async reset(key: string): Promise<void> {
    await this.client.del(key);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
    else await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** Exposed for health checks. */
  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
