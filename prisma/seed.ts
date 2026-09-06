import { PrismaClient } from '@prisma/client';

/*
 * The Prisma CLI reads .env on its own; ts-node does not, and this script runs
 * under ts-node. Node's own loader keeps it dependency-free, and a missing file
 * is fine — in CI the values come from the environment already.
 */
try {
  process.loadEnvFile();
} catch {
  // no .env here; rely on what is already in the environment
}

import { hash } from '@node-rs/argon2';
import {
  PERMISSION_DESCRIPTIONS,
  ROLE_DEFINITIONS,
  ROLES,
} from '../src/modules/rbac/rbac.constants';

const prisma = new PrismaClient();

/**
 * Brings the roles and permissions in the database in line with the code.
 *
 * Idempotent by design — every write is an upsert keyed on the stable string
 * key, so running it twice changes nothing and running it after adding a
 * permission adds exactly that one. It is a deploy step, not a migration:
 * the shape of the tables is the migration's business, their contents are this.
 */
async function main(): Promise<void> {
  for (const [key, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }

  for (const [key, definition] of Object.entries(ROLE_DEFINITIONS)) {
    const role = await prisma.role.upsert({
      where: { key },
      update: { name: definition.name, description: definition.description },
      create: {
        key,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
    });

    const permissions = await prisma.permission.findMany({
      where: { key: { in: definition.permissions } },
    });

    // Replace rather than merge, so removing a permission from the code
    // actually takes it away from the role.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });

    console.log(`role ${key}: ${permissions.length} permissions`);
  }

  await seedAdmin();
  await seedDemoCustomer();
}

/**
 * An administrator for a fresh environment, and only when asked for by name.
 *
 * Guarded by an environment variable rather than a hardcoded default, because
 * a seeded admin with a known password is how staging environments end up
 * owned. Nothing is created if SEED_ADMIN_EMAIL is absent.
 */
async function seedAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('No SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD — skipping the admin account');
    return;
  }

  await upsertUser(email, password, ROLES.ADMIN, 'Krist', 'Admin');
  console.log(`admin ready: ${email}`);
}

/**
 * One customer to sign in with while the storefront is being wired up.
 *
 * Development only, and it refuses outright in production — a known password
 * on a real deployment is not a convenience, it is a way in. The credentials
 * are overridable so nobody has to edit this file.
 */
async function seedDemoCustomer(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('production — skipping the demo customer');
    return;
  }

  const email = (process.env.SEED_USER_EMAIL ?? 'robertfox@example.com').trim().toLowerCase();
  const password = process.env.SEED_USER_PASSWORD ?? 'Password-1234';

  await upsertUser(email, password, ROLES.CUSTOMER, 'Robert', 'Fox');
  console.log(`demo customer ready: ${email} / ${password}`);
}

/**
 * Idempotent, and deliberately does not touch an existing password: running
 * the seed again on an environment where someone has changed theirs should
 * not quietly put it back.
 */
async function upsertUser(
  email: string,
  password: string,
  roleKey: string,
  firstName: string,
  lastName: string,
): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      // Verified on creation: an unconfirmed seed account cannot sign in once
      // REQUIRE_VERIFIED_EMAIL is turned on, which defeats the purpose.
      emailVerified: new Date(),
      profile: { create: { firstName, lastName } },
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
