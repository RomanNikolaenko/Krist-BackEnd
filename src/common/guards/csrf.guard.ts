import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from 'src/config/app-config.service';
import { CSRF_COOKIE, CSRF_HEADER } from '../constants';
import { safeEqual } from '../utils/crypto.util';

/** Requests that cannot change anything do not need the ceremony. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF, plus an origin check.
 *
 * The reasoning matters, because `HttpOnly` is the flag people mistake for CSRF
 * protection. HttpOnly stops a script from *reading* the session cookie; it does
 * nothing about a form on another site making the browser *send* it. So the
 * request has to prove it came from our own page, which it does by echoing a
 * value only our own page can read — hence the one cookie that is deliberately
 * not HttpOnly. An attacker's site can make the browser send cookies, but the
 * same-origin policy stops it reading them, so it cannot produce the header.
 *
 * Two independent checks, because each covers the other's gap:
 *
 *  - SameSite=Lax already blocks cross-site POSTs in every current browser, but
 *    it is the browser's promise, not ours, and it does nothing for a same-site
 *    subdomain that has been taken over.
 *  - Origin/Referer is cheap and catches the plain cross-site case, but the
 *    header is absent on some legitimate requests, so it cannot stand alone.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    this.assertOrigin(request);
    this.assertToken(request);

    return true;
  }

  /**
   * If the browser told us where the request came from, it has to be somewhere
   * we allow. A missing header is not treated as failure: some legitimate
   * clients omit it, and the token check below still has to pass.
   */
  private assertOrigin(request: Request): void {
    const origin = request.headers.origin ?? originOf(request.headers.referer);
    if (!origin) return;

    if (!this.config.corsOrigins.includes(origin)) {
      throw new ForbiddenException('Request origin is not allowed');
    }
  }

  private assertToken(request: Request): void {
    const cookie = request.cookies?.[CSRF_COOKIE] as string | undefined;
    const header = request.headers[CSRF_HEADER];
    const sent = Array.isArray(header) ? header[0] : header;

    if (!cookie || !sent || !safeEqual(cookie, sent)) {
      throw new ForbiddenException('CSRF token missing or invalid');
    }
  }
}

function originOf(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
