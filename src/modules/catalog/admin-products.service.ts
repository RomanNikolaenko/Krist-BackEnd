import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BASE_LOCALE, Locale } from 'src/common/decorators/locale.decorator';
import { trimmedOrNull } from 'src/common/utils/text.util';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import {
  AdminProductQueryDto,
  CreateProductDto,
  ProductImageInput,
  UpdateProductDto,
} from './dto/admin-product.dto';
import { localisedName } from './admin-taxonomy.service';

export interface AdminProductView {
  id: string;
  slug: string;
  brand: string;
  name: string;
  description: string;
  price: number;
  oldPrice: number | null;
  /**
   * Both levels, told apart. The list screen shows departments and what is
   * inside them in separate columns, and a bare array of keys made that
   * impossible without loading the whole taxonomy beside it.
   */
  categories: { key: string; name: string; parentKey: string | null }[];
  /// One entry per locale. The base language lives in the columns above.
  translations: { locale: string; name: string | null; description: string | null }[];
  /**
   * The name is what the form sends back; the label is what a person reads.
   * They differ as soon as the colour has been translated, and the table was
   * showing "Червоний, Orange" — half the row in each language.
   */
  colors: { name: string; label: string }[];
  /// Sizes are S/M/L everywhere, so there is nothing to translate.
  sizes: string[];
  stock: number;
  /** `stock > 0`, so the badge and the shop agree on one number. */
  inStock: boolean;
  images: string[];
  /** Shown before a delete, so nobody removes something people wrote about. */
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminProductPage {
  items: AdminProductView[];
  total: number;
  pages: number;
}

type ProductRow = Prisma.ProductGetPayload<{
  include: {
    categories: { include: { parent: { select: { key: true } }; translations: true } };
    translations: true;
    images: true;
    colors: { include: { translations: true } };
    sizes: true;
    _count: { select: { reviews: true } };
  };
}>;

const INCLUDE = {
  categories: {
    orderBy: { position: 'asc' },
    include: { parent: { select: { key: true } }, translations: true },
  },
  translations: true,
  images: { orderBy: { position: 'asc' } },
  colors: { orderBy: { position: 'asc' }, include: { translations: true } },
  sizes: { orderBy: { position: 'asc' } },
  _count: { select: { reviews: true } },
} satisfies Prisma.ProductInclude;

const PAGE_SIZE = 20;

@Injectable()
export class AdminProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminProductQueryDto, locale: Locale = BASE_LOCALE): Promise<AdminProductPage> {
    const term = query.q?.trim();
    const where: Prisma.ProductWhereInput = term
      ? {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { brand: { contains: term, mode: 'insensitive' } },
            { slug: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {};

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? PAGE_SIZE;

    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        // Most recently touched first: after saving something you want to see
        // it, not hunt for it alphabetically.
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: INCLUDE,
      }),
    ]);

    return {
      items: rows.map((row) => this.toView(row, locale)),
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async byId(id: string, locale: Locale = BASE_LOCALE): Promise<AdminProductView> {
    const row = await this.prisma.product.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new NotFoundException('No such product');

    return this.toView(row, locale);
  }

  async create(dto: CreateProductDto): Promise<AdminProductView> {
    this.assertDiscount(dto.price, dto.oldPrice);

    const row = await this.prisma.product.create({
      data: {
        slug: await this.uniqueSlug(`${dto.brand} ${dto.name}`),
        brand: dto.brand,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        oldPrice: dto.oldPrice ?? null,
        categories: { connect: await this.categoryIds(dto.categories) },
        colors: { connect: await this.colorIds(dto.colors) },
        sizes: { connect: await this.sizeIds(dto.sizes) },
        stock: dto.stock ?? 0,
        images: { create: imageRows(dto.images) },
        translations: { create: translationRows(dto.translations) },
      },
      include: INCLUDE,
    });

    return this.toView(row);
  }

  /**
   * Applies only the fields that arrived.
   *
   * The slug is left alone even when the name changes: it is the address
   * customers have bookmarked and search engines have indexed, and silently
   * moving a page because somebody fixed a typo breaks both.
   */
  async update(id: string, dto: UpdateProductDto): Promise<AdminProductView> {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: { price: true, oldPrice: true },
    });
    if (!existing) throw new NotFoundException('No such product');

    const price = dto.price ?? Number(existing.price);
    const oldPrice =
      dto.oldPrice === undefined
        ? existing.oldPrice === null
          ? null
          : Number(existing.oldPrice)
        : dto.oldPrice;
    this.assertDiscount(price, oldPrice);

    const data: Prisma.ProductUpdateInput = {};

    if (dto.brand !== undefined) data.brand = dto.brand;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.oldPrice !== undefined) data.oldPrice = dto.oldPrice;
    if (dto.stock !== undefined) data.stock = dto.stock;
    // `set` rather than `connect`: the form sends the whole selection, so
    // anything missing from it is something that was deselected.
    if (dto.categories) data.categories = { set: await this.categoryIds(dto.categories) };
    if (dto.colors) data.colors = { set: await this.colorIds(dto.colors) };
    if (dto.sizes) data.sizes = { set: await this.sizeIds(dto.sizes) };

    if (dto.images) {
      // Replaced rather than merged: the gallery arrives as the order somebody
      // arranged, and reconciling that against existing rows would invent
      // differences the screen never expressed.
      data.images = { deleteMany: {}, create: imageRows(dto.images) };
    }

    await this.prisma.product.update({ where: { id }, data });

    if (dto.translations) await this.writeTranslations(id, dto.translations);

    // Re-read rather than trusting the update's own row: the translations are
    // written after it, and the caller wants the product as it now stands.
    return this.byId(id);
  }

  /**
   * Removes a product from the catalogue.
   *
   * Orders survive it. Their lines keep their own copy of the name, image and
   * price and only lose the link, so somebody's receipt still reads the same
   * after the shop stops selling the thing. Reviews and wish lists go with it,
   * which is why the count travels with the record.
   */
  async remove(id: string): Promise<void> {
    const { count } = await this.prisma.product.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('No such product');
  }

  /** What the two multi-selects offer, and the only values they will accept. */
  async options() {
    const [colors, sizes] = await Promise.all([
      this.prisma.color.findMany({ orderBy: { position: 'asc' } }),
      this.prisma.size.findMany({ orderBy: { position: 'asc' } }),
    ]);

    return { colors, sizes };
  }

  /**
   * Turns names into ids, refusing the whole request if any is unknown.
   *
   * Quietly dropping one would save a product missing a colour somebody
   * believed they had chosen, and nothing on the screen would say so.
   */
  private async colorIds(names: string[]): Promise<{ id: string }[]> {
    const rows = await this.prisma.color.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true },
    });
    assertAllFound(names, rows, 'colour');

    return rows.map((row) => ({ id: row.id }));
  }

  private async sizeIds(names: string[]): Promise<{ id: string }[]> {
    const rows = await this.prisma.size.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true },
    });
    assertAllFound(names, rows, 'size');

    return rows.map((row) => ({ id: row.id }));
  }

  /**
   * Replaces the translations for the locales the form sent.
   *
   * Locales it did not mention are left alone, so a screen that only edits
   * Ukrainian cannot wipe a language it never showed. A locale that arrives
   * with both fields blank is a translation being withdrawn, and the row
   * goes rather than sitting there empty pretending to be one.
   */
  private async writeTranslations(
    productId: string,
    translations: { locale: string; name?: string | null; description?: string | null }[],
  ): Promise<void> {
    for (const value of translations) {
      const locale = value.locale;
      if (locale === BASE_LOCALE) continue;

      const name = trimmedOrNull(value.name);
      const description = trimmedOrNull(value.description);

      if (!name && !description) {
        await this.prisma.productTranslation.deleteMany({ where: { productId, locale } });
        continue;
      }

      await this.prisma.productTranslation.upsert({
        where: { productId_locale: { productId, locale } },
        update: { name, description },
        create: { productId, locale, name, description },
      });
    }
  }

  /**
   * Categories by key, refusing the whole request if any is unknown — the
   * same contract as colours and sizes, for the same reason.
   *
   * A subcategory brings its department with it. Storing both is what keeps
   * the filter for "Men" finding the shoes underneath without every query
   * having to walk the tree, and doing it here rather than trusting the form
   * means the two can never drift apart.
   */
  private async categoryIds(keys: string[]): Promise<{ id: string }[]> {
    const rows = await this.prisma.category.findMany({
      where: { key: { in: keys } },
      select: { id: true, key: true, parentId: true },
    });

    const known = new Set(rows.map((row) => row.key));
    const missing = keys.filter((key) => !known.has(key));

    if (missing.length) {
      throw new BadRequestException(`There is no category called "${missing.join('", "')}"`);
    }

    const ids = new Set(rows.map((row) => row.id));
    for (const row of rows) {
      if (row.parentId) ids.add(row.parentId);
    }

    return [...ids].map((id) => ({ id }));
  }

  private assertDiscount(price: number, oldPrice: number | null | undefined): void {
    if (oldPrice !== null && oldPrice !== undefined && oldPrice <= price) {
      throw new BadRequestException('The old price has to be higher than the current one');
    }
  }

  /**
   * A readable address, and a free one.
   *
   * Two products can share a brand and a name — a restock under a new SKU, a
   * colourway — so a collision appends a number rather than failing the save
   * and leaving somebody to invent a name the URL will accept.
   */
  private async uniqueSlug(source: string): Promise<string> {
    const base =
      source
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 80) || 'product';

    for (let suffix = 0; suffix < 50; suffix += 1) {
      const slug = suffix === 0 ? base : `${base}-${suffix + 1}`;
      const taken = await this.prisma.product.count({ where: { slug } });
      if (!taken) return slug;
    }

    throw new BadRequestException('Could not find a free address for that name');
  }

  private toView(row: ProductRow, locale: Locale = BASE_LOCALE): AdminProductView {
    return {
      id: row.id,
      slug: row.slug,
      brand: row.brand,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      oldPrice: row.oldPrice === null ? null : Number(row.oldPrice),
      categories: row.categories.map((category) => ({
        key: category.key,
        // The label the admin screens show; the key is what they send back.
        name: localisedName(category, locale),
        parentKey: category.parent?.key ?? null,
      })),
      translations: row.translations.map((entry) => ({
        locale: entry.locale,
        name: entry.name,
        description: entry.description,
      })),
      colors: row.colors.map((color) => ({
        name: color.name,
        label: localisedName(color, locale),
      })),
      sizes: row.sizes.map((size) => size.name),
      stock: row.stock,
      inStock: row.stock > 0,
      images: row.images.map((image) => image.url),
      reviewCount: row._count.reviews,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

function assertAllFound(asked: string[], found: { name: string }[], noun: string): void {
  const known = new Set(found.map((row) => row.name));
  const missing = asked.filter((name) => !known.has(name));

  if (missing.length) {
    throw new BadRequestException(`There is no ${noun} called "${missing.join('", "')}"`);
  }
}

const imageRows = (images: ProductImageInput[]) =>
  images.map((image, position) => ({ url: image.url, position }));

/** Blank fields are not translations, and an all-blank locale is not a row. */
const translationRows = (
  translations: { locale: string; name?: string | null; description?: string | null }[] = [],
) =>
  translations
    .filter((entry) => entry.locale !== BASE_LOCALE)
    .map((entry) => ({
      locale: entry.locale,
      name: trimmedOrNull(entry.name),
      description: trimmedOrNull(entry.description),
    }))
    .filter((row) => row.name !== null || row.description !== null);
