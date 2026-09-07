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
import { seedCatalogue } from './seed/catalogue';
import { seedDemoPeople } from './seed/storefront';

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
  await retireLegacyDemoCustomer();

  const products = await seedCatalogue(prisma);
  await seedDemoPeople(prisma, products);
}

/**
 * Removes the single "Robert Fox" account this seed used to create.
 *
 * He existed to have somebody to sign in as while the storefront was wired up,
 * and the app filled his screens from hard-coded arrays. Five real customers
 * with histories of their own replace him, and leaving him behind would leave
 * one account whose orders and reviews are still fiction.
 *
 * Deliberately narrow: it matches the one address this file used to seed and
 * nothing else, and it does not run in production, where an account by that
 * name would be somebody's.
 */
async function retireLegacyDemoCustomer(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  const { count } = await prisma.user.deleteMany({ where: { email: 'robertfox@example.com' } });
  if (count) console.log('removed the old demo customer robertfox@example.com');
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
