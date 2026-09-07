import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { BASE_LOCALE, Locale } from 'src/common/decorators/locale.decorator';
import { ProductView, ProductsService } from 'src/modules/catalog/products.service';

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  async list(userId: string, locale: Locale = BASE_LOCALE): Promise<ProductView[]> {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { addedAt: 'desc' },
      select: { productId: true },
    });

    return this.products.viewsFor(
      rows.map((row) => row.productId),
      locale,
    );
  }

  /**
   * Adding what is already there is not an error.
   *
   * The heart on a product card is a toggle the client can double-fire — two
   * taps, or one tap and a retried request — and answering the second with a
   * conflict would make the UI show a failure for a state it already wanted.
   */
  async add(userId: string, productId: string): Promise<{ productIds: string[] }> {
    const exists = await this.prisma.product.count({ where: { id: productId } });
    if (!exists) throw new NotFoundException('No such product');

    await this.prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      update: {},
      create: { userId, productId },
    });

    return this.ids(userId);
  }

  async remove(userId: string, productId: string): Promise<{ productIds: string[] }> {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, productId } });
    return this.ids(userId);
  }

  /**
   * Folds a signed-out wish list into the account on sign-in.
   *
   * A shopper who hearts things before signing in should not lose them for it,
   * and the merge is one-way on purpose: it adds, never removes, so a list built
   * on a phone survives a sign-in on a laptop that has one of its own.
   */
  async merge(userId: string, productIds: string[]): Promise<{ productIds: string[] }> {
    if (productIds.length === 0) return this.ids(userId);

    const known = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });

    await this.prisma.wishlistItem.createMany({
      data: known.map((product) => ({ userId, productId: product.id })),
      skipDuplicates: true,
    });

    return this.ids(userId);
  }

  private async ids(userId: string): Promise<{ productIds: string[] }> {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { addedAt: 'desc' },
      select: { productId: true },
    });

    return { productIds: rows.map((row) => row.productId) };
  }
}
