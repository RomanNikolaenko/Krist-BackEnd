import { hash } from '@node-rs/argon2';
import { CardBrand, NotificationKind, OrderStatus, PrismaClient } from '@prisma/client';
import { ROLES } from '../../src/modules/rbac/rbac.constants';
import { CATALOGUE, ProductIds } from './catalogue';
import { DEMO_PEOPLE, DemoPerson } from './people';

/** What the cart charges for delivery. Kept in step with the storefront. */
const DELIVERY = 5;

const day = 24 * 60 * 60 * 1000;
const ago = (days: number): Date => new Date(Date.now() - days * day);

const priceOf = (id: number): number => catalogueItem(id).price;

function catalogueItem(id: number) {
  const item = CATALOGUE.PRODUCTS.find((p) => p.id === id);
  if (!item) throw new Error(`The seed refers to product ${id}, which is not in the catalogue`);
  return item;
}

/**
 * Writes the five demo customers and everything they have done.
 *
 * Development only. A set of accounts with a password printed to the console is
 * a convenience on a laptop and a way in on a real deployment, so this refuses
 * to run when NODE_ENV says production — the same rule the demo customer it
 * replaces was already following.
 *
 * Idempotent, and narrowly so: each person's own rows are cleared and rewritten
 * on every run, and nothing outside those five accounts is touched. A real
 * account that happens to share the database keeps its orders and its reviews.
 */
export async function seedDemoPeople(prisma: PrismaClient, products: ProductIds): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('production — skipping the demo people');
    return;
  }

  const password = process.env.SEED_DEMO_PASSWORD ?? 'Krist-Demo-2026';
  // One hash for five accounts: Argon2id is deliberately slow, and they share
  // the password anyway.
  const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const roles = new Map(
    (await prisma.role.findMany({ select: { id: true, key: true } })).map((r) => [r.key, r.id]),
  );

  const userIds = new Map<string, string>();

  for (const person of DEMO_PEOPLE) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: {
        emailVerified: new Date(),
        profile: {
          upsert: {
            create: profileOf(person),
            update: profileOf(person),
          },
        },
      },
      create: {
        email: person.email,
        passwordHash,
        // Verified on creation: an unconfirmed account cannot sign in once
        // REQUIRE_VERIFIED_EMAIL is turned on, which defeats the purpose.
        emailVerified: new Date(),
        lastLoginAt: ago(1),
        profile: { create: profileOf(person) },
      },
    });

    // Everyone shops, and the one who runs the catalogue does both.
    const wanted = [ROLES.CUSTOMER, ...(person.role === 'ADMIN' ? [ROLES.ADMIN] : [])];

    for (const key of wanted) {
      const roleId = roles.get(key);
      if (!roleId) continue;

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: { userId: user.id, roleId },
      });
    }

    userIds.set(person.email, user.id);
  }

  // Cleared in one pass before anything is written, because a like refers to a
  // review that another person in this same list wrote.
  const ids = [...userIds.values()];
  await prisma.reviewLike.deleteMany({ where: { userId: { in: ids } } });
  await prisma.review.deleteMany({ where: { userId: { in: ids } } });
  await prisma.order.deleteMany({ where: { userId: { in: ids } } });
  await prisma.wishlistItem.deleteMany({ where: { userId: { in: ids } } });
  await prisma.savedCard.deleteMany({ where: { userId: { in: ids } } });
  await prisma.address.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });

  let orderSeq = 0;

  for (const person of DEMO_PEOPLE) {
    const userId = userIds.get(person.email);
    if (!userId) throw new Error(`No user for ${person.email}`);

    for (const address of person.addresses) {
      await prisma.address.create({ data: { userId, ...address } });
    }

    for (const card of person.cards) {
      await prisma.savedCard.create({
        data: { userId, ...card, brand: CardBrand[card.brand] },
      });
    }

    await prisma.wishlistItem.createMany({
      data: person.wishlist.map((id) => ({ userId, productId: productId(products, id) })),
    });

    const defaultAddress = await prisma.address.findFirst({
      where: { userId, isDefault: true },
    });

    for (const order of person.orders) {
      orderSeq += 1;
      const placedAt = ago(order.daysAgo);
      const subtotal = order.lines.reduce((sum, l) => sum + priceOf(l.product) * l.qty, 0);
      const discount = order.discount ?? 0;

      await prisma.order.create({
        data: {
          userId,
          number: `KR-${placedAt.getFullYear()}-${String(orderSeq).padStart(4, '0')}`,
          addressId: defaultAddress?.id ?? null,
          subtotal,
          delivery: DELIVERY,
          discount,
          total: subtotal - discount + DELIVERY,
          placedAt,
          items: {
            create: order.lines.map((line) => {
              const item = catalogueItem(line.product);
              return {
                productId: productId(products, line.product),
                // Snapshot: an order records what was bought at a moment, and a
                // later price change must not rewrite it.
                name: `${item.brand} ${item.name}`,
                image: item.images[0],
                price: item.price,
                // Names, like everything else a line records about what was bought.
                size: line.size,
                color: line.color,
                qty: line.qty,
                status: OrderStatus[line.status],
              };
            }),
          },
        },
      });
    }

    for (const review of person.reviews) {
      const createdAt = ago(review.daysAgo);
      await prisma.review.create({
        data: {
          userId,
          productId: productId(products, review.product),
          rating: review.rating,
          title: review.title,
          body: review.body,
          createdAt,
          updatedAt: createdAt,
        },
      });
    }
  }

  // Second pass: every review now exists, so a like can find the one it names.
  let likes = 0;

  for (const person of DEMO_PEOPLE) {
    const userId = userIds.get(person.email);
    if (!userId) continue;

    for (const like of person.likes) {
      const authorId = userIds.get(like.author);
      if (!authorId || authorId === userId) continue;

      const review = await prisma.review.findUnique({
        where: {
          productId_userId: { productId: productId(products, like.product), userId: authorId },
        },
      });
      if (!review) continue;

      await prisma.reviewLike.create({ data: { reviewId: review.id, userId } });
      likes += 1;
    }
  }

  const notifications = await seedNotifications(prisma, userIds);

  const totals = DEMO_PEOPLE.reduce(
    (acc, p) => ({
      addresses: acc.addresses + p.addresses.length,
      cards: acc.cards + p.cards.length,
      wishlist: acc.wishlist + p.wishlist.length,
      orders: acc.orders + p.orders.length,
      reviews: acc.reviews + p.reviews.length,
    }),
    { addresses: 0, cards: 0, wishlist: 0, orders: 0, reviews: 0 },
  );

  console.log(
    `demo people: ${DEMO_PEOPLE.length} accounts, ${totals.addresses} addresses, ` +
      `${totals.cards} cards, ${totals.wishlist} wishlisted, ${totals.orders} orders, ` +
      `${totals.reviews} reviews, ${likes} likes, ${notifications} notifications`,
  );
  console.log(`demo password: ${password}`);
}

function profileOf(person: DemoPerson) {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    phone: person.phone,
    avatarUrl: person.avatar,
    addressLine: person.addressLine,
  };
}

function productId(products: ProductIds, catalogueId: number): string {
  const id = products.get(catalogueId);
  if (!id) throw new Error(`Product ${catalogueId} was never seeded`);
  return id;
}

/**
 * Notifications follow from what already happened rather than being invented:
 * an order placed, a parcel delivered, a review posted. Anything older than a
 * week is marked read, which is roughly what an active account looks like.
 */
async function seedNotifications(
  prisma: PrismaClient,
  userIds: Map<string, string>,
): Promise<number> {
  let created = 0;

  for (const person of DEMO_PEOPLE) {
    const userId = userIds.get(person.email);
    if (!userId) continue;

    const rows: {
      kind: NotificationKind;
      metadata: Record<string, string>;
      createdAt: Date;
    }[] = [];

    // Read back rather than recomputed: the number in the notification has to
    // be the number on the order, and only the database knows what that was.
    const orders = await prisma.order.findMany({
      where: { userId },
      select: { number: true, placedAt: true, items: { select: { status: true } } },
    });

    for (const order of orders) {
      rows.push({
        kind: NotificationKind.ORDER_PLACED,
        metadata: { number: order.number },
        createdAt: order.placedAt,
      });

      // Only once the whole order has arrived — a part-delivered parcel is not
      // something to tell someone is done.
      const delivered = order.items.every((i) => i.status === OrderStatus.DELIVERED);
      const arrivedAt = new Date(order.placedAt.getTime() + 4 * day);

      if (delivered && arrivedAt < new Date()) {
        rows.push({
          kind: NotificationKind.ORDER_DELIVERED,
          metadata: { number: order.number },
          createdAt: arrivedAt,
        });
      }
    }

    const latest = [...person.reviews].sort((a, b) => a.daysAgo - b.daysAgo)[0];
    if (latest) {
      const item = catalogueItem(latest.product);
      rows.push({
        kind: NotificationKind.REVIEW_POSTED,
        metadata: { product: `${item.brand} ${item.name}` },
        createdAt: ago(latest.daysAgo),
      });
    }

    rows.push({
      kind: NotificationKind.PROFILE_UPDATED,
      metadata: {},
      createdAt: ago(9),
    });

    for (const row of rows) {
      await prisma.notification.create({
        data: {
          userId,
          kind: row.kind,
          metadata: row.metadata,
          createdAt: row.createdAt,
          readAt: row.createdAt < ago(7) ? row.createdAt : null,
        },
      });
      created += 1;
    }
  }

  return created;
}
