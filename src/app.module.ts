import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CsrfGuard } from './common/guards/csrf.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { SessionGuard } from './common/guards/session.guard';
import { HttpLoggerMiddleware } from './common/middleware/http-logger.middleware';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppConfigModule } from './config/config.module';
import { HealthController } from './health.controller';
import { MailModule } from './infra/mail/mail.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';

/**
 * The guards are registered globally and in a deliberate order — Nest runs
 * APP_GUARD providers in the order they are declared here:
 *
 *   1. CSRF          — reject a forged request before it costs anything
 *   2. RateLimit     — then bound how often the rest can be attempted
 *   3. Session       — who is this?
 *   4. Roles         — what kind of person are they?
 *   5. Permissions   — may they do this exact thing?
 *
 * Authentication and authorization stay separate layers: SessionGuard answers
 * only the first question and attaches the answer to the request, the two after
 * it read that answer and never touch the database.
 *
 * Global-by-default means a new controller is closed until someone marks it
 * `@Public()`. The alternative fails open, and fails silently.
 */
@Module({
  imports: [AppConfigModule, PrismaModule, RedisModule, MailModule, AuthModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, HttpLoggerMiddleware).forRoutes('*');
  }
}
