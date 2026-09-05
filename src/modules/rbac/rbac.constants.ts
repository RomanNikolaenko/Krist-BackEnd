/**
 * The authorization vocabulary.
 *
 * Roles are how people are described; permissions are what the code checks.
 * Guards read permissions so that re-cutting the roles later is a data change
 * rather than a search through controllers.
 *
 * Only what the storefront needs today is listed. An unused permission is a
 * promise the code has not kept.
 */

export const ROLES = {
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  SUPPORT: 'SUPPORT',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  PRODUCTS_READ: 'products.read',
  PRODUCTS_WRITE: 'products.write',
  ORDERS_READ: 'orders.read',
  ORDERS_WRITE: 'orders.write',
  USERS_READ: 'users.read',
  USERS_WRITE: 'users.write',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Seeded shape. Changing this is a seed run, not a migration. */
export const ROLE_DEFINITIONS: Record<
  RoleKey,
  { name: string; description: string; permissions: PermissionKey[] }
> = {
  [ROLES.CUSTOMER]: {
    name: 'Customer',
    description: 'Shops, and manages their own account',
    permissions: [PERMISSIONS.PRODUCTS_READ],
  },
  [ROLES.SUPPORT]: {
    name: 'Support',
    description: 'Reads orders and customer records to answer questions',
    permissions: [PERMISSIONS.PRODUCTS_READ, PERMISSIONS.ORDERS_READ, PERMISSIONS.USERS_READ],
  },
  [ROLES.MANAGER]: {
    name: 'Manager',
    description: 'Runs the catalogue and the order book',
    permissions: [
      PERMISSIONS.PRODUCTS_READ,
      PERMISSIONS.PRODUCTS_WRITE,
      PERMISSIONS.ORDERS_READ,
      PERMISSIONS.ORDERS_WRITE,
      PERMISSIONS.USERS_READ,
    ],
  },
  [ROLES.ADMIN]: {
    name: 'Administrator',
    description: 'Everything, including other people’s accounts',
    permissions: Object.values(PERMISSIONS),
  },
};

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  [PERMISSIONS.PRODUCTS_READ]: 'View the catalogue',
  [PERMISSIONS.PRODUCTS_WRITE]: 'Create, edit and remove products',
  [PERMISSIONS.ORDERS_READ]: 'View orders',
  [PERMISSIONS.ORDERS_WRITE]: 'Change and cancel orders',
  [PERMISSIONS.USERS_READ]: 'View user accounts',
  [PERMISSIONS.USERS_WRITE]: 'Change user accounts and their roles',
};
