import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CSRF_COOKIE, CSRF_HEADER } from '../constants';
import { CsrfGuard } from './csrf.guard';

const config = {
  corsOrigins: ['http://localhost:4200'],
} as unknown as ConstructorParameters<typeof CsrfGuard>[0];

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function post(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    cookies: { [CSRF_COOKIE]: 'token-value' },
    headers: { origin: 'http://localhost:4200', [CSRF_HEADER]: 'token-value' },
    ...overrides,
  };
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard(config);

  it('lets a well-formed same-origin write through', () => {
    expect(guard.canActivate(contextFor(post()))).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('does not challenge %s', (method) => {
    const request = { method, cookies: {}, headers: {} };
    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it('rejects a write with no token at all — the plain CSRF case', () => {
    const request = post({ headers: { origin: 'http://localhost:4200' } });
    expect(() => guard.canActivate(contextFor(request))).toThrow(ForbiddenException);
  });

  it('rejects a header that does not match the cookie', () => {
    const request = post({
      headers: { origin: 'http://localhost:4200', [CSRF_HEADER]: 'a-different-token' },
    });
    expect(() => guard.canActivate(contextFor(request))).toThrow(ForbiddenException);
  });

  it('rejects a cookie the attacker guessed but could not read back', () => {
    // The browser attaches cookies to a cross-site POST; the same-origin policy
    // stops the attacker reading them, so the header cannot be produced.
    const request = post({ headers: { origin: 'https://evil.example' } });
    expect(() => guard.canActivate(contextFor(request))).toThrow(ForbiddenException);
  });

  it('rejects a foreign origin even when both token copies are present', () => {
    const request = post({
      headers: {
        origin: 'https://evil.example',
        [CSRF_HEADER]: 'token-value',
      },
    });
    expect(() => guard.canActivate(contextFor(request))).toThrow(/origin is not allowed/i);
  });

  it('derives the origin from Referer when Origin is absent', () => {
    const request = post({
      headers: {
        referer: 'https://evil.example/attack.html',
        [CSRF_HEADER]: 'token-value',
      },
    });
    expect(() => guard.canActivate(contextFor(request))).toThrow(ForbiddenException);
  });

  it('still requires the token when neither Origin nor Referer is sent', () => {
    const allowed = post({ headers: { [CSRF_HEADER]: 'token-value' } });
    expect(guard.canActivate(contextFor(allowed))).toBe(true);

    const denied = post({ headers: {} });
    expect(() => guard.canActivate(contextFor(denied))).toThrow(ForbiddenException);
  });
});
