import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './infra/prisma/prisma.service';
import { RedisService } from './infra/redis/redis.service';

/**
 * Liveness and readiness. Reports which dependency is unhappy without saying
 * anything about where it lives or why.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async check() {
    const [database, cache] = await Promise.all([this.checkDatabase(), this.redis.ping()]);
    const status = database && cache ? 'ok' : 'degraded';

    return { status, database, cache };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
