import { SetMetadata } from '@nestjs/common';
import { PERMISSIONS_KEY, ROLES_KEY } from '../constants';

/** Any one of the listed roles is enough. */
export const RequireRoles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Every listed permission is required. Prefer this over roles for anything
 * that guards a specific capability — roles change shape over time, a
 * permission key means the same thing forever.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
