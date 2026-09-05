import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

/**
 * SessionService is exported because the global SessionGuard depends on it —
 * the guard runs for every request in the app, not only for /auth.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, AuditService],
  exports: [SessionService, AuditService],
})
export class AuthModule {}
