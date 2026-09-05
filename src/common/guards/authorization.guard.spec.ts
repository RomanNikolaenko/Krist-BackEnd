import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestUser } from '../types/request-user';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';

function contextFor(user?: Partial<RequestUser>): ExecutionContext {
  const request = user ? { user: { id: 'u1', roles: [], permissions: [], ...user } } : {};

  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function reflectorReturning(value: string[] | undefined): Reflector {
  return { getAllAndOverride: () => value } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('passes a route that asks for nothing', () => {
    const guard = new RolesGuard(reflectorReturning(undefined));
    expect(guard.canActivate(contextFor({ roles: [] }))).toBe(true);
  });

  it('accepts any one of the listed roles', () => {
    const guard = new RolesGuard(reflectorReturning(['ADMIN', 'MANAGER']));
    expect(guard.canActivate(contextFor({ roles: ['MANAGER'] }))).toBe(true);
  });

  it('refuses a user holding none of them', () => {
    const guard = new RolesGuard(reflectorReturning(['ADMIN']));
    expect(() => guard.canActivate(contextFor({ roles: ['CUSTOMER'] }))).toThrow(
      ForbiddenException,
    );
  });

  it('refuses rather than passes when no user reached the guard', () => {
    const guard = new RolesGuard(reflectorReturning(['ADMIN']));
    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
  });
});

describe('PermissionsGuard', () => {
  it('requires every listed permission, not just one', () => {
    const guard = new PermissionsGuard(reflectorReturning(['orders.read', 'orders.write']));

    expect(() => guard.canActivate(contextFor({ permissions: ['orders.read'] }))).toThrow(
      /orders.write/,
    );
    expect(guard.canActivate(contextFor({ permissions: ['orders.read', 'orders.write'] }))).toBe(
      true,
    );
  });

  it('passes a route that asks for nothing', () => {
    const guard = new PermissionsGuard(reflectorReturning(undefined));
    expect(guard.canActivate(contextFor({ permissions: [] }))).toBe(true);
  });

  it('refuses when the request carries no identity', () => {
    const guard = new PermissionsGuard(reflectorReturning(['users.read']));
    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
  });
});
