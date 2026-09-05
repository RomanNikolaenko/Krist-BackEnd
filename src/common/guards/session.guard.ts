import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SessionService } from 'src/modules/auth/session.service';
import { IS_PUBLIC_KEY, SESSION_COOKIE } from '../constants';

/**
 * Turns the session cookie into `request.user`, or refuses the request.
 *
 * Registered globally, so a route is closed unless it says otherwise with
 * `@Public()`. The inverse — open by default, guarded by decorator — fails in
 * the direction that leaks, and the mistake is invisible in review.
 *
 * This guard answers "who is this?" only. What they may do is the next two
 * guards' problem, and keeping the two apart is what lets the answer to the
 * first be cached on the request.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;

    // A public route still resolves the session when one is present: /auth/me
    // has to answer "nobody" without a 401, and login needs to know whether it
    // is replacing an existing session.
    const resolved = await this.sessions.resolve(token);

    if (resolved) {
      request.user = resolved.user;
      request.authSession = resolved.session;
      await this.sessions.touch(resolved.session);
    }

    if (isPublic) return true;
    if (!resolved) throw new UnauthorizedException('Authentication required');

    return true;
  }
}
