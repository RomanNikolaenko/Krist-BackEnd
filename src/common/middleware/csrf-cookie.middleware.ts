import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppConfigService } from 'src/config/app-config.service';
import { CSRF_COOKIE } from '../constants';
import { generateToken } from '../utils/crypto.util';

/**
 * Makes sure a visitor always has a CSRF token, session or no session.
 *
 * Without this the scheme has a hole shaped like a chicken and an egg: login is
 * a write, so `CsrfGuard` demands the token — but the token used to be minted
 * only when a session was issued, which happens *after* a successful login. The
 * first login of a fresh browser could never pass.
 *
 * So the token is issued on the way in, to anyone who lacks one. That is not a
 * weakening: the value is unguessable and readable only from our own origin, so
 * a cross-site page still cannot produce the matching header. It is rotated
 * again when a session is created, which is the moment that matters — a token
 * handed out before authentication should not survive it.
 *
 * Only when absent. Replacing it on every request would invalidate the token a
 * page already holds and break any request in flight.
 */
@Injectable()
export class CsrfCookieMiddleware implements NestMiddleware {
  constructor(private readonly config: AppConfigService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const existing = request.cookies?.[CSRF_COOKIE] as string | undefined;

    if (!existing) {
      const token = generateToken(24);
      response.cookie(
        CSRF_COOKIE,
        token,
        this.config.csrfCookieOptions(this.config.sessionIdleTimeout),
      );

      // The guard reads from the request, and this one has not been round
      // tripped through the browser yet — put it where the guard will look.
      request.cookies = { ...request.cookies, [CSRF_COOKIE]: token };
    }

    next();
  }
}
