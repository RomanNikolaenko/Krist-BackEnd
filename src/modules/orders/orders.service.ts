import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationKind, OrderStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { BASE_LOCALE, Locale } from 'src/common/decorators/locale.decorator';
import { firstFilled } from 'src/common/utils/text.util';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { PlaceOrderDto } from './dto/order.dto';

/** What delivery costs, and what the codes are worth. */
const DELIVERY = 5;
const DISCOUNT_CODES: Record<string, number> = { KRIST10: 10, WELCOME5: 5 };

export interface OrderLineView {
  id: string;
  productId: string | null;
  /** The slug the catalogue knows it by, when it is still listed. */
  slug: string | null;
  name: string;
  image: string;
  price: number;
  size: string;
  /** The colour as the line recorded it — the shop's own name for it. */
  color: string | null;
  /**
   * The same colour in the language being read, when the catalogue still knows
   * it. Falls back to the recorded name, which is what an order is: a record of
   * a moment, not a live reference to a row somebody can rename.
   */
  colorLabel: string | null;
  qty: number;
  status: OrderStatus;
}

/** Where it went. Null once the address it pointed at has been deleted. */
export interface OrderAddressView {
  name: string;
  phone: string;
  line1: string;
  area: string;
  city: string;
  pin: string;
  state: string;
}

export interface OrderView {
  id: string;
  number: string;
  placedAt: Date;
  subtotal: number;
  delivery: number;
  discount: number;
  total: number;
  address: OrderAddressView | null;
  items: OrderLineView[];
}

type OrderRow = Prisma.OrderGetPayload<{
  include: { items: { include: { product: { select: { slug: true } } } }; address: true };
}>;

const INCLUDE = {
  items: { include: { product: { select: { slug: true } } } },
  address: true,
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, locale: Locale = BASE_LOCALE): Promise<OrderView[]> {
    const rows = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { placedAt: 'desc' },
      include: INCLUDE,
    });

    const colors = await this.colorLabels(rows, locale);

    return rows.map((row) => this.toView(row, colors));
  }

  async byId(userId: string, id: string, locale: Locale = BASE_LOCALE): Promise<OrderView> {
    const row = await this.prisma.order.findFirst({ where: { id, userId }, include: INCLUDE });
    if (!row) throw new NotFoundException('No such order');

    return this.toView(row, await this.colorLabels([row], locale));
  }

  /**
   * The colours these orders mention, named in the language being read.
   *
   * One query for the whole page rather than one per line, and everything it
   * cannot find is simply absent from the map — a colour retired since the
   * order was placed keeps the name it was bought under.
   */
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

  /**
   * Turns a basket into an order.
   *
   * Two things are deliberately not taken from the request. The price of every
   * line is read from the catalogue, so the total is what the shop charges
   * rather than what the browser claimed; and the discount is looked up from
   * the code, so a client cannot name its own reduction.
   *
   * The line also keeps a copy of the name, image and price as they are now.
   * An order is a record of a moment, and a later price change must not rewrite
   * what somebody already paid.
   */
  async place(userId: string, dto: PlaceOrderDto): Promise<OrderView> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.lines.map((line) => line.productId) } },
      include: {
        images: { orderBy: { position: 'asc' }, take: 1 },
        colors: { select: { name: true } },
        sizes: { select: { name: true } },
      },
    });

    const byId = new Map(products.map((product) => [product.id, product]));

    const lines = dto.lines.map((line) => {
      const product = byId.get(line.productId);
      if (!product) throw new BadRequestException('The basket names a product that is not listed');
      if (product.stock <= 0) throw new BadRequestException(`${product.name} is out of stock`);

      /*
       * Checked by name against what this product is actually sold in. Colours
       * and sizes are the shop's own vocabulary now rather than an enum, so the
       * product is the only thing that can say whether a variant exists.
       */
      const size = line.size;
      const color = line.color ?? null;

      if (!product.sizes.some((s) => s.name === size)) {
        throw new BadRequestException(`${product.name} does not come in ${size}`);
      }
      if (color && !product.colors.some((c) => c.name === color)) {
        throw new BadRequestException(`${product.name} does not come in ${color}`);
      }

      return {
        productId: product.id,
        name: `${product.brand} ${product.name}`,
        image: product.images[0]?.url ?? '',
        price: product.price,
        size,
        color,
        qty: line.qty,
        status: OrderStatus.PROCESSING,
      };
    });

    if (dto.addressId) {
      const owned = await this.prisma.address.count({ where: { id: dto.addressId, userId } });
      if (!owned) throw new BadRequestException('That address is not yours');
    }

    const subtotal = lines.reduce((sum, line) => sum + Number(line.price) * line.qty, 0);
    const discount = Math.min(
      dto.discountCode ? (DISCOUNT_CODES[dto.discountCode.toUpperCase()] ?? 0) : 0,
      subtotal,
    );

    const number = await this.nextNumber();

    /*
     * One transaction, and the stock comes off first.
     *
     * The decrement carries its own condition — `stock >= qty` — so two people
     * buying the last jacket at the same moment cannot both succeed: whichever
     * statement runs second matches no row, and its order is rolled back with
     * everything else. Reading the count and then writing it would be exactly
     * the race this avoids.
     */
    const order = await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const { count } = await tx.product.updateMany({
          where: { id: line.productId, stock: { gte: line.qty } },
          data: { stock: { decrement: line.qty } },
        });

        if (!count) throw new BadRequestException(`${line.name} is out of stock`);
      }

      return tx.order.create({
        data: {
          userId,
          number,
          addressId: dto.addressId ?? null,
          subtotal,
          delivery: DELIVERY,
          discount,
          total: subtotal - discount + DELIVERY,
          items: { create: lines },
        },
        include: INCLUDE,
      });
    });

    await this.prisma.notification.create({
      data: {
        userId,
        kind: NotificationKind.ORDER_PLACED,
        metadata: { number: order.number },
      },
    });

    return this.toView(order, new Map());
  }

  /**
   * Cancels one line of an order.
   *
   * Per line rather than per order, because that is how the screen shows it:
   * one parcel can be on its way while another has not been picked. Scoped by
   * owner and by status in the same statement, so a line belonging to someone
   * else, or one already delivered, simply matches nothing.
   */
  async cancelLine(userId: string, lineId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.orderItem.updateMany({
        where: { id: lineId, status: OrderStatus.PROCESSING, order: { userId } },
        data: { status: OrderStatus.CANCELLED },
      });

      if (!count) throw new NotFoundException('No such line, or it can no longer be cancelled');

      /*
       * Back on the shelf. The update above matched, so this line was theirs
       * and was still being processed — running it twice is impossible, which
       * is what keeps the count honest.
       */
      const line = await tx.orderItem.findUniqueOrThrow({
        where: { id: lineId },
        select: { productId: true, qty: true },
      });

      if (line.productId) {
        await tx.product.update({
          where: { id: line.productId },
          data: { stock: { increment: line.qty } },
        });
      }
    });
  }

  /**
   * A number a customer can read down the phone.
   *
   * Random rather than sequential, because a sequence would need either a lock
   * or a race, and it would also tell anyone who ordered how many orders the
   * shop has taken. The unique index is the actual guarantee; this retries into
   * it rather than trusting the odds.
   */
  private async nextNumber(): Promise<string> {
    const year = new Date().getFullYear();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = randomBytes(4).readUInt32BE(0).toString(36).toUpperCase().padStart(6, '0');
      const number = `KR-${year}-${suffix.slice(0, 6)}`;

      const taken = await this.prisma.order.count({ where: { number } });
      if (!taken) return number;
    }

    throw new Error('Could not allocate an order number');
  }

  private toView(row: OrderRow, colors: Map<string, string>): OrderView {
    return {
      id: row.id,
      number: row.number,
      placedAt: row.placedAt,
      subtotal: Number(row.subtotal),
      delivery: Number(row.delivery),
      discount: Number(row.discount),
      total: Number(row.total),
      address: row.address
        ? {
            name: row.address.name,
            phone: row.address.phone,
            line1: row.address.line1,
            area: row.address.area,
            city: row.address.city,
            pin: row.address.pin,
            state: row.address.state,
          }
        : null,
      items: row.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        slug: item.product?.slug ?? null,
        name: item.name,
        image: item.image,
        price: Number(item.price),
        // Already the names the customer saw: the line stored them, not a
        // reference to something that can be renamed underneath it.
        size: item.size,
        color: item.color,
        colorLabel: item.color === null ? null : (colors.get(item.color) ?? item.color),
        qty: item.qty,
        status: item.status,
      })),
    };
  }
}

/** Narrows away the lines that recorded no colour at all. */
function isName(value: string | null): value is string {
  return value !== null;
}
