import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BASE_LOCALE, Locale } from 'src/common/decorators/locale.decorator';
import { firstFilled } from 'src/common/utils/text.util';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import {
  CreateCategoryDto,
  CreateColorDto,
  CreateSizeDto,
  UpdateCategoryDto,
  UpdateColorDto,
  UpdateSizeDto,
  TaxonomyTranslationDto,
} from './dto/taxonomy.dto';

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/**
 * The vocabulary the catalogue is written in: colours, sizes and categories.
 *
 * All three used to be fixed — two as enums, one as a seeded list — which meant
 * selling something in a colour nobody had anticipated took a migration and a
 * deploy. They are rows now, and this is where they are managed.
 *
 * Nothing here deletes something that is in use. A colour removed from under a
 * product would quietly change what that product is sold in, and the person
 * doing it would have no way to know.
 */
@Injectable()
export class AdminTaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------- colours

  /**
   * The admin panel is translated too, so its lists answer in the language it
   * is being read in. The row's own name stays the fallback, which is what an
   * untranslated row shows.
   */
  async colors(locale: Locale = BASE_LOCALE) {
    const rows = await this.prisma.color.findMany({
      orderBy: { position: 'asc' },
      include: { _count: { select: { products: true } }, translations: true },
    });

    return rows.map((row) => ({ ...row, label: localisedName(row, locale) }));
  }

  async createColor(dto: CreateColorDto) {
    await this.assertFreeName(this.prisma.color, dto.name, 'colour');

    const row = await this.prisma.color.create({
      data: {
        name: dto.name,
        slug: slugify(dto.name),
        hex: dto.hex.toLowerCase(),
        position: dto.position ?? (await this.nextPosition('color')),
      },
    });

    await this.writeColorNames(row.id, dto.translations);

    return this.colorById(row.id);
  }

  async updateColor(id: string, dto: UpdateColorDto) {
    await this.assertExists(this.prisma.color, id, 'colour');
    if (dto.name) await this.assertFreeName(this.prisma.color, dto.name, 'colour', id);

    await this.prisma.color.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name, slug: slugify(dto.name) }),
        ...(dto.hex === undefined ? {} : { hex: dto.hex.toLowerCase() }),
        ...(dto.position === undefined ? {} : { position: dto.position }),
      },
    });

    await this.writeColorNames(id, dto.translations);

    return this.colorById(id);
  }

  async removeColor(id: string): Promise<void> {
    const used = await this.prisma.product.count({ where: { colors: { some: { id } } } });
    if (used) {
      throw new ConflictException(
        `${used} product${used === 1 ? ' is' : 's are'} sold in this colour. Take it off them first.`,
      );
    }

    await this.assertExists(this.prisma.color, id, 'colour');
    await this.prisma.color.delete({ where: { id } });
  }

  // --------------------------------------------------------------- sizes

  sizes() {
    return this.prisma.size.findMany({
      orderBy: { position: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  async createSize(dto: CreateSizeDto) {
    await this.assertFreeName(this.prisma.size, dto.name, 'size');

    return this.prisma.size.create({
      data: {
        name: dto.name,
        slug: slugify(dto.name),
        position: dto.position ?? (await this.nextPosition('size')),
      },
    });
  }

  async updateSize(id: string, dto: UpdateSizeDto) {
    await this.assertExists(this.prisma.size, id, 'size');
    if (dto.name) await this.assertFreeName(this.prisma.size, dto.name, 'size', id);

    return this.prisma.size.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name, slug: slugify(dto.name) }),
        ...(dto.position === undefined ? {} : { position: dto.position }),
      },
    });
  }

  async removeSize(id: string): Promise<void> {
    const used = await this.prisma.product.count({ where: { sizes: { some: { id } } } });
    if (used) {
      throw new ConflictException(
        `${used} product${used === 1 ? ' comes' : 's come'} in this size. Take it off them first.`,
      );
    }

    await this.assertExists(this.prisma.size, id, 'size');
    await this.prisma.size.delete({ where: { id } });
  }

  /**
   * Replaces the names for the locales that arrived.
   *
   * A locale sent blank is a translation being withdrawn, and the row goes
   * rather than sitting there empty pretending to be one. Locales the form
   * did not mention are left alone.
   */
  private async writeCategoryNames(
    categoryId: string,
    translations: TaxonomyTranslationDto[] = [],
  ): Promise<void> {
    for (const entry of translations) {
      if (entry.locale === BASE_LOCALE) continue;

      const name = entry.name.trim();
      const where = { categoryId_locale: { categoryId, locale: entry.locale } };

      if (!name) {
        await this.prisma.categoryTranslation.deleteMany({
          where: { categoryId, locale: entry.locale },
        });
        continue;
      }

      await this.prisma.categoryTranslation.upsert({
        where,
        update: { name },
        create: { categoryId, locale: entry.locale, name },
      });
    }
  }

  private async writeColorNames(
    colorId: string,
    translations: TaxonomyTranslationDto[] = [],
  ): Promise<void> {
    for (const entry of translations) {
      if (entry.locale === BASE_LOCALE) continue;

      const name = entry.name.trim();

      if (!name) {
        await this.prisma.colorTranslation.deleteMany({
          where: { colorId, locale: entry.locale },
        });
        continue;
      }

      await this.prisma.colorTranslation.upsert({
        where: { colorId_locale: { colorId, locale: entry.locale } },
        update: { name },
        create: { colorId, locale: entry.locale, name },
      });
    }
  }

  /** One row with its translations — what every write answers with. */
  private colorById(id: string) {
    return this.prisma.color.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { products: true } }, translations: true },
    });
  }

  private categoryById(id: string) {
    return this.prisma.category.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { products: true } }, translations: true },
    });
  }
  // ---------------------------------------------------------- categories

  async categories(locale: Locale = BASE_LOCALE) {
    const rows = await this.prisma.category.findMany({
      orderBy: { position: 'asc' },
      include: { _count: { select: { products: true } }, translations: true },
    });

    return rows.map((row) => ({ ...row, label: localisedName(row, locale) }));
  }

  /**
   * The key is derived from the first name and then fixed. It is what the shop
   * filters on and what a shared link carries, so a later rename changes the
   * label without breaking anybody's bookmark.
   */
  async createCategory(dto: CreateCategoryDto) {
    const parentId = dto.parentId ?? null;

    if (parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: parentId },
        select: { parentId: true, name: true },
      });

      if (!parent) throw new BadRequestException('There is no such department');
      // One level, and the check is here rather than in the DTO because only
      // the database knows whether the chosen parent is itself a child.
      if (parent.parentId) {
        throw new BadRequestException(
          `"${parent.name}" is already inside a department; categories nest one level`,
        );
      }
    }

    const key = dto.name.trim();
    const taken = await this.prisma.category.count({ where: { key } });
    if (taken) throw new ConflictException(`There is already a category called "${key}"`);

    const slug = slugify(key);
    if (!slug) throw new BadRequestException('That name has no letters or digits in it');

    const row = await this.prisma.category.create({
      data: {
        key,
        slug,
        name: key,
        parentId,
        // Only a department needs a picture: the home rail shows those alone.
        image: parentId
          ? null
          : (dto.image ?? `https://picsum.photos/seed/krist-cat-${slug}/540/700`),
        position: dto.position ?? (await this.nextPosition('category')),
      },
    });

    await this.writeCategoryNames(row.id, dto.translations);

    return this.categoryById(row.id);
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.assertExists(this.prisma.category, id, 'category');

    await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.image === undefined ? {} : { image: dto.image }),
        ...(dto.position === undefined ? {} : { position: dto.position }),
      },
    });

    await this.writeCategoryNames(id, dto.translations);

    return this.categoryById(id);
  }

  async removeCategory(id: string): Promise<void> {
    const children = await this.prisma.category.count({ where: { parentId: id } });
    if (children) {
      throw new ConflictException(
        `This department holds ${children} subcategor${children === 1 ? 'y' : 'ies'}. Remove ` +
          'them first.',
      );
    }

    const used = await this.prisma.product.count({ where: { categories: { some: { id } } } });
    if (used) {
      throw new ConflictException(
        `${used} product${used === 1 ? ' is' : 's are'} in this category. Move them first.`,
      );
    }

    await this.assertExists(this.prisma.category, id, 'category');
    await this.prisma.category.delete({ where: { id } });
  }

  // --------------------------------------------------------------- shared

  /**
   * One past the last one, so a new entry lands at the bottom of the list
   * rather than silently sharing a place with something already there.
   *
   * Written out per table rather than indexed dynamically: the three delegates
   * are different types, and pretending otherwise only moves the problem into a
   * cast.
   */
  private async nextPosition(model: 'color' | 'size' | 'category'): Promise<number> {
    const args = { orderBy: { position: 'desc' }, select: { position: true } } as const;

    const last =
      model === 'color'
        ? await this.prisma.color.findFirst(args)
        : model === 'size'
          ? await this.prisma.size.findFirst(args)
          : await this.prisma.category.findFirst(args);

    return (last?.position ?? -1) + 1;
  }

  private async assertExists(
    model: { count: (args: { where: { id: string } }) => Promise<number> },
    id: string,
    noun: string,
  ): Promise<void> {
    const found = await model.count({ where: { id } });
    if (!found) throw new NotFoundException(`No such ${noun}`);
  }

  private async assertFreeName(
    model: { findUnique: (args: { where: { name: string } }) => Promise<{ id: string } | null> },
    name: string,
    noun: string,
    allowId?: string,
  ): Promise<void> {
    const existing = await model.findUnique({ where: { name } });
    if (existing && existing.id !== allowId) {
      throw new ConflictException(`There is already a ${noun} called "${name}"`);
    }
  }
}

/** A taxonomy row named in one language, falling back to its own name. */
export function localisedName(
  row: { name: string; translations: { locale: string; name: string }[] },
  locale: Locale,
): string {
  if (locale === BASE_LOCALE) return row.name;

  return firstFilled(row.translations.find((entry) => entry.locale === locale)?.name, row.name);
}
