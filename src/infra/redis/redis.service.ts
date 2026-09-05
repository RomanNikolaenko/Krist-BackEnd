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
    });

    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log('Redis connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
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
