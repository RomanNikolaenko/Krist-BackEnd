import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { BASE_LOCALE, Locale } from 'src/common/decorators/locale.decorator';
import { firstFilled } from 'src/common/utils/text.util';
import { PAGE_SIZE, ProductQueryDto } from './dto/product-query.dto';

export interface ProductView {
  /**
   * Only ever true on the detail page, and only for somebody signed in who has
   * ordered it. Absent from the list views, where nobody is being offered a
   * review form.
   */
  canReview?: boolean;
  id: string;
  slug: string;
  brand: string;
  name: string;
  price: number;
  oldPrice: number | null;
  /// Every category it is sold under, in the order the shop lists them.
  categories: string[];
  colors: string[];
  sizes: string[];
  /** Null when nobody has reviewed it — which is not the same as zero stars. */
  rating: number | null;
  reviewCount: number;
  inStock: boolean;
  images: string[];
  description: string;
}

export interface ProductPage {
  items: ProductView[];
  total: number;
  pages: number;
  from: number;
  to: number;
}

export interface Facets {
  /// Departments, each carrying whatever sits inside it. One level deep.
  categories: {
    key: string;
    slug: string;
    name: string;
    image: string | null;
    count: number;
    children: { key: string; slug: string; name: string; count: number }[];
  }[];
  colors: { name: string; label: string; hex: string; count: number }[];
  sizes: { name: string; count: number }[];
  minPrice: number;
  maxPrice: number;
}

type ProductRow = Prisma.ProductGetPayload<{
  include: { categories: true; images: true; colors: true; sizes: true; translations: true };
}>;

interface Rating {
  average: number;
  count: number;
}

/**
 * Everything a product view needs. Colours and sizes are rows now, so they
 * come along with the images rather than being decoded from an enum.
 */
const INCLUDE = {
  categories: { orderBy: { position: 'asc' } },
  translations: true,
  images: { orderBy: { position: 'asc' } },
  colors: { orderBy: { position: 'asc' } },
  sizes: { orderBy: { position: 'asc' } },
} satisfies Prisma.ProductInclude;

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProductQueryDto, locale: Locale = BASE_LOCALE): Promise<ProductPage> {
    const where = this.filter(query);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? PAGE_SIZE;

    const total = await this.prisma.product.count({ where });
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const skip = (page - 1) * pageSize;

    const rows =
      query.sort === 'rating'
        ? await this.pageByRating(where, skip, pageSize)
        : await this.prisma.product.findMany({
            where,
            orderBy: this.order(query.sort),
            skip,
            take: pageSize,
            include: INCLUDE,
          });

    const ratings = await this.ratings(rows.map((row) => row.id));

    return {
      items: rows.map((row) => this.toView(row, ratings.get(row.id), locale)),
      total,
      pages,
      from: total === 0 ? 0 : skip + 1,
      to: Math.min(skip + pageSize, total),
    };
  }

  async bySlug(
    slug: string,
    locale: Locale = BASE_LOCALE,
    viewerId: string | null = null,
  ): Promise<ProductView> {
    const row = await this.prisma.product.findUnique({
      where: { slug },
      include: INCLUDE,
    });

    if (!row) throw new NotFoundException('No such product');

    const [ratings, bought] = await Promise.all([
      this.ratings([row.id]),
      this.hasBought(viewerId, row.id),
    ]);

    return { ...this.toView(row, ratings.get(row.id), locale), canReview: bought };
  }

  /**
   * Whether the person reading has ever ordered this.
   *
   * The page asks so it can offer the review form to somebody who can actually
   * use it. The server refuses the write either way — this only decides whether
   * a form is put in front of them at all, rather than letting them type a
   * paragraph and be told no afterwards.
   */
  private async hasBought(viewerId: string | null, productId: string): Promise<boolean> {
    if (!viewerId) return false;

    const line = await this.prisma.orderItem.findFirst({
      where: { productId, status: { not: OrderStatus.CANCELLED }, order: { userId: viewerId } },
      select: { id: true },
    });

    return line !== null;
  }

  /**
   * What to show underneath a product: the rest of its own category first, then
   * whatever else fills the row. A shopper looking at a coat is better served by
   * another coat than by the next thing in the catalogue.
   */
  async related(slug: string, count = 4, locale: Locale = BASE_LOCALE): Promise<ProductView[]> {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true, categories: { select: { id: true } } },
    });
    if (!product) throw new NotFoundException('No such product');

    const sameCategory = await this.prisma.product.findMany({
      where: {
        categories: { some: { id: { in: product.categories.map((c) => c.id) } } },
        id: { not: product.id },
      },
      take: count,
      include: INCLUDE,
    });

    const rows =
      sameCategory.length >= count
        ? sameCategory
        : [
            ...sameCategory,
            ...(await this.prisma.product.findMany({
              where: {
                id: { notIn: [product.id, ...sameCategory.map((p) => p.id)] },
              },
              take: count - sameCategory.length,
              include: INCLUDE,
            })),
          ];

    const ratings = await this.ratings(rows.map((row) => row.id));
    return rows.map((row) => this.toView(row, ratings.get(row.id), locale));
  }

  /**
   * The best-rated things people have actually rated.
   *
   * Unreviewed products are left out rather than sorted to the bottom: a
   * "bestsellers" row is a claim, and an item nobody has said anything about
   * cannot support it.
   */
  async bestsellers(count = 8, locale: Locale = BASE_LOCALE): Promise<ProductView[]> {
    const ranked = await this.prisma.review.groupBy({
      by: ['productId'],
      _avg: { rating: true },
      _count: { _all: true },
      orderBy: { _avg: { rating: 'desc' } },
      take: count,
    });

    if (ranked.length === 0) return [];

    const ids = ranked.map((row) => row.productId);
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: INCLUDE,
    });

    const ratings = await this.ratings(ids);
    const byId = new Map(rows.map((row) => [row.id, row]));

    return ids
      .map((id) => byId.get(id))
      .filter(isDefined)
      .map((row) => this.toView(row, ratings.get(row.id), locale));
  }

  /**
   * The same product shape, for a set of ids somebody else is holding — a wish
   * list, an order's lines. Returned in the order asked for, and silently short
   * if one of them has since been withdrawn from the catalogue.
   */
  async viewsFor(productIds: string[], locale: Locale = BASE_LOCALE): Promise<ProductView[]> {
    if (productIds.length === 0) return [];

    const rows = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: INCLUDE,
    });

    const ratings = await this.ratings(productIds);
    const byId = new Map(rows.map((row) => [row.id, row]));

    return productIds
      .map((id) => byId.get(id))
      .filter(isDefined)
      .map((row) => this.toView(row, ratings.get(row.id), locale));
  }

  /**
   * The counts beside every filter, derived from the catalogue rather than
   * written down. A facet that says "Black (12)" and then shows nine is worse
   * than no number at all.
   *
   * Colours and sizes are counted by the database now that they are rows: the
   * join it already maintains is a better place to ask "how many products are
   * black" than a loop over every product in the shop.
   */
  async facets(locale: Locale = BASE_LOCALE): Promise<Facets> {
    const [categories, colors, sizes, range] = await Promise.all([
      this.prisma.category.findMany({
        orderBy: { position: 'asc' },
        include: {
          _count: { select: { products: true } },
          translations: true,
          children: {
            orderBy: { position: 'asc' },
            include: { _count: { select: { products: true } }, translations: true },
          },
        },
      }),
      this.prisma.color.findMany({
        orderBy: { position: 'asc' },
        include: { _count: { select: { products: true } }, translations: true },
      }),
      this.prisma.size.findMany({
        orderBy: { position: 'asc' },
        include: { _count: { select: { products: true } } },
      }),
      this.prisma.product.aggregate({ _min: { price: true }, _max: { price: true } }),
    ]);

    return {
      // Only the departments are listed; a subcategory appears inside its own
      // parent rather than a second time at the top.
      categories: categories
        .filter((category) => category.parentId === null)
        .map((category) => ({
          key: category.key,
          slug: category.slug,
          name: localised(category.translations, category.name, locale),
          image: category.image,
          count: category._count.products,
          children: category.children.map((child) => ({
            key: child.key,
            slug: child.slug,
            name: localised(child.translations, child.name, locale),
            count: child._count.products,
          })),
        })),
      colors: colors.map((color) => ({
        // The key the shop filters on stays the base name; only the label moves.
        name: color.name,
        label: localised(color.translations, color.name, locale),
        hex: color.hex,
        count: color._count.products,
      })),
      sizes: sizes.map((size) => ({ name: size.name, count: size._count.products })),
      // Rounded outwards, so the slider can always reach the cheapest and the
      // dearest thing in the shop rather than stopping just short of them.
      minPrice: Math.floor(Number(range._min.price ?? 0)),
      maxPrice: Math.ceil(Number(range._max.price ?? 0)),
    };
  }

  private filter(query: ProductQueryDto): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {};

    if (query.categories?.length) where.categories = { some: { key: { in: query.categories } } };

    // Named rather than decoded: a colour the shop has never heard of simply
    // matches nothing, which is what a stale bookmark deserves.
    if (query.colors?.length) where.colors = { some: { name: { in: query.colors } } };
    if (query.sizes?.length) where.sizes = { some: { name: { in: query.sizes } } };

    // Both ends, and only the ones that were asked for: a shared bookmark
    // carries whatever the slider was on, which may be either, both or neither.
    const price: Prisma.DecimalFilter = {};
    if (query.minPrice !== undefined) price.gte = query.minPrice;
    if (query.maxPrice !== undefined) price.lte = query.maxPrice;
    if (Object.keys(price).length) where.price = price;

    const term = query.q?.trim();
    if (term) {
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { brand: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private order(sort: ProductQueryDto['sort']): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'price-asc':
        return [{ price: 'asc' }, { slug: 'asc' }];
      case 'price-desc':
        return [{ price: 'desc' }, { slug: 'asc' }];
      default:
        return [{ createdAt: 'desc' }, { slug: 'asc' }];
    }
  }

  /**
   * Ordering by rating cannot be a SQL `ORDER BY`, because the rating is not a
   * column — it is the average of another table. So the matching ids and their
   * averages are pulled, sorted here, and only the page is fetched in full.
   *
   * That reads every matching id, which is the right trade at catalogue size
   * and the wrong one at a hundred thousand products. When that day comes the
   * answer is a materialised average on `products`, refreshed when a review is
   * written — not a bigger query here.
   */
  private async pageByRating(
    where: Prisma.ProductWhereInput,
    skip: number,
    take: number,
  ): Promise<ProductRow[]> {
    const matching = await this.prisma.product.findMany({ where, select: { id: true } });
    const ratings = await this.ratings(matching.map((row) => row.id));

    const pageIds = matching
      .map((row) => ({ id: row.id, average: ratings.get(row.id)?.average ?? 0 }))
      .sort((a, b) => b.average - a.average || a.id.localeCompare(b.id))
      .slice(skip, skip + take)
      .map((row) => row.id);

    if (pageIds.length === 0) return [];

    const rows = await this.prisma.product.findMany({
      where: { id: { in: pageIds } },
      include: INCLUDE,
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    return pageIds.map((id) => byId.get(id)).filter(isDefined);
  }

  private async ratings(productIds: string[]): Promise<Map<string, Rating>> {
    if (productIds.length === 0) return new Map();

    const rows = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _avg: { rating: true },
      _count: { _all: true },
    });

    return new Map(
      rows.map((row) => [
        row.productId,
        // One decimal is all the star widget renders, and it keeps 4.499999
        // out of the response.
        { average: Math.round((row._avg.rating ?? 0) * 10) / 10, count: row._count._all },
      ]),
    );
  }

  /**
   * The product as one language sees it.
   *
   * Each field falls back on its own: a translation row that names the
   * product but has no description yet is more useful than no row at all,
   * and refusing to use half of it would be the wrong kind of strict.
   */
  private toView(row: ProductRow, rating: Rating | undefined, locale: Locale): ProductView {
    const translation =
      locale === BASE_LOCALE
        ? undefined
        : row.translations.find((entry) => entry.locale === locale);

    return {
      id: row.id,
      slug: row.slug,
      brand: row.brand,
      name: firstFilled(translation?.name, row.name),
      price: Number(row.price),
      oldPrice: row.oldPrice === null ? null : Number(row.oldPrice),
      categories: row.categories.map((category) => category.key),
      colors: row.colors.map((color) => color.name),
      sizes: row.sizes.map((size) => size.name),
      rating: rating?.average ?? null,
      reviewCount: rating?.count ?? 0,
      inStock: row.stock > 0,
      images: row.images.map((image) => image.url),
      description: firstFilled(translation?.description, row.description),
    };
  }
}

/**
 * The name in the language asked for, or the row's own name.
 *
 * Per row rather than per request: a translator who has done the departments
 * but not everything inside them leaves a menu that is mostly translated,
 * which is more use than one that is not translated at all.
 */
function localised(
  translations: { locale: string; name: string }[],
  fallback: string,
  locale: Locale,
): string {
  if (locale === BASE_LOCALE) return fallback;

  return firstFilled(translations.find((entry) => entry.locale === locale)?.name, fallback);
}
