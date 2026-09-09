import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationKind, OrderStatus, Prisma } from '@prisma/client';
import { BASE_LOCALE, Locale } from 'src/common/decorators/locale.decorator';
import { firstFilled } from 'src/common/utils/text.util';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { AdminOrderQueryDto } from './dto/admin-order.dto';

export interface AdminOrderLineView {
  id: string;
  name: string;
  image: string;
  price: number;
  size: string;
  color: string | null;
  colorLabel: string | null;
  qty: number;
  status: OrderStatus;
}

export interface AdminOrderView {
  id: string;
  number: string;
  placedAt: Date;
  total: number;
  customer: { name: string; email: string };
  /** Where it is going, flattened. Null once the address has been deleted. */
  shipTo: string | null;
  /**
   * The status of the order as a whole: the one its lines agree on, or null
   * when they do not. A three-item order can be half delivered, and saying
   * "delivered" over that would be a lie this screen has to avoid telling.
   */
  status: OrderStatus | null;
  lines: AdminOrderLineView[];
}

export interface AdminOrderPage {
  items: AdminOrderView[];
  total: number;
  pages: number;
}

const INCLUDE = {
  items: { orderBy: { id: 'asc' } },
  address: true,
  // The name lives on the profile; the account itself only knows an email.
  user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof INCLUDE }>;

const PAGE_SIZE = 20;

/**
 * The order book.
 *
 * Separate from the customer's own service because the questions are different:
 * that one answers "what did I buy", this one answers "what does the shop owe,
 * and to whom".
 */
@Injectable()
export class AdminOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminOrderQueryDto, locale: Locale = BASE_LOCALE): Promise<AdminOrderPage> {
    const term = query.q?.trim();

    const where: Prisma.OrderWhereInput = {
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: 'insensitive' } },
              { user: { email: { contains: term, mode: 'insensitive' } } },
              { user: { profile: { firstName: { contains: term, mode: 'insensitive' } } } },
              { user: { profile: { lastName: { contains: term, mode: 'insensitive' } } } },
            ],
          }
        : {}),
      // An order matches a status when any of its lines is in it, which is what
      // somebody filtering for "returned" is looking for.
      ...(query.status ? { items: { some: { status: query.status } } } : {}),
    };

    const page = Math.max(1, query.page ?? 1);

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: INCLUDE,
      }),
      this.prisma.order.count({ where }),
    ]);

    const colors = await this.colorLabels(rows, locale);

    return {
      items: rows.map((row) => this.toView(row, colors)),
      total,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  /**
   * Moves a whole order to one status.
   *
   * Per order rather than per line, because that is how somebody packing a
   * parcel thinks about it. Lines the customer cancelled are left where they
   * are: they are not part of what is being shipped, and marking them delivered
   * would quietly undo a decision that was not the shop's to make.
   */
  async setStatus(
    id: string,
    status: OrderStatus,
    locale: Locale = BASE_LOCALE,
  ): Promise<AdminOrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { userId: true, number: true },
    });

    if (!order) throw new NotFoundException('No such order');

    const count = await this.prisma.$transaction(async (tx) => {
      /*
       * A return comes back to the shelf, and only once: lines already returned
       * are excluded from the update, so pressing "returned" twice moves
       * nothing and restocks nothing.
       */
      if (status === OrderStatus.RETURNED) {
        const returning = await tx.orderItem.findMany({
          where: {
            orderId: id,
            status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
            productId: { not: null },
          },
          select: { productId: true, qty: true },
        });

        for (const line of returning) {
          await tx.product.update({
            where: { id: line.productId! },
            data: { stock: { increment: line.qty } },
          });
        }
      }

      const { count } = await tx.orderItem.updateMany({
        where: { orderId: id, status: { not: OrderStatus.CANCELLED } },
        data: { status },
      });

      return count;
    });

    // Worth telling somebody about; the shop has been promising this event
    // since the notification kinds were written and never raising it.
    if (count && status === OrderStatus.DELIVERED) {
      await this.prisma.notification.create({
        data: {
          userId: order.userId,
          kind: NotificationKind.ORDER_DELIVERED,
          metadata: { number: order.number },
        },
      });
    }

    const row = await this.prisma.order.findUniqueOrThrow({ where: { id }, include: INCLUDE });

    return this.toView(row, await this.colorLabels([row], locale));
  }

  /** One query for the whole page, so a colour name costs nothing per line. */
  private async colorLabels(rows: OrderRow[], locale: Locale): Promise<Map<string, string>> {
    const names = [
      ...new Set(rows.flatMap((row) => row.items.map((item) => item.color).filter(isName))),
    ];

    if (!names.length || locale === BASE_LOCALE) return new Map();

    const colors = await this.prisma.color.findMany({
      where: { name: { in: names } },
      include: { translations: { where: { locale } } },
    });

    return new Map(
      colors.map((color) => [color.name, firstFilled(color.translations[0]?.name, color.name)]),
    );
  }

  private toView(row: OrderRow, colors: Map<string, string>): AdminOrderView {
    const live = row.items.filter((item) => item.status !== OrderStatus.CANCELLED);
    const statuses = new Set(live.map((item) => item.status));

    return {
      id: row.id,
      number: row.number,
      placedAt: row.placedAt,
      total: Number(row.total),
      customer: {
        name: [row.user.profile?.firstName, row.user.profile?.lastName].filter(Boolean).join(' '),
        email: row.user.email,
      },
      shipTo: row.address
        ? [
            row.address.name,
            `${row.address.line1} ${row.address.area}`,
            `${row.address.city}, ${row.address.state} ${row.address.pin}`,
          ].join(' · ')
        : null,
      status: this.overallStatus(live.length, statuses),
      lines: row.items.map((item) => ({
        id: item.id,
        name: item.name,
        image: item.image,
        price: Number(item.price),
        size: item.size,
        color: item.color,
        colorLabel: item.color === null ? null : (colors.get(item.color) ?? item.color),
        qty: item.qty,
        status: item.status,
      })),
    };
  }

  private overallStatus(live: number, statuses: Set<OrderStatus>): OrderStatus | null {
    if (live === 0) return OrderStatus.CANCELLED;

    return statuses.size === 1 ? [...statuses][0] : null;
  }
}

/** Narrows away the lines that recorded no colour at all. */
function isName(value: string | null): value is string {
  return value !== null;
}
