import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../constants';

/**
 * Coarse gate: is this user one of the listed kinds of people?
 *
 * Runs after SessionGuard, so an unauthenticated request has already been
 * turned away with a 401. Reaching here without a user would mean the route is
 * public, and a public route asking about roles is a wiring mistake — hence
 * the 403 rather than a silent pass.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<Request>();
    if (!user) throw new ForbiddenException();

    if (!required.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException('This account does not have the required role');
    }

    return true;
  }
}
