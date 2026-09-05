import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../constants';

/**
 * Fine gate: may this user do this specific thing?
 *
 * Every listed permission is required, not any of them — a handler that needs
 * two capabilities needs both, and expressing that as "any" is the kind of
 * quiet widening nobody notices.
 *
 * The permission set was flattened onto the request by SessionGuard, so this
 * costs no query however many handlers ask.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<Request>();
    if (!user) throw new ForbiddenException();

    const missing = required.filter((permission) => !user.permissions.includes(permission));
    if (missing.length) {
      // The names are the app's own vocabulary, not a secret; telling the
      // caller which one is missing makes the API debuggable without
      // revealing anything about other accounts.
      throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    }

    return true;
  }
}
