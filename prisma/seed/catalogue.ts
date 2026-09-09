import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { SUBCATEGORIES } from './subcategories';
import { UK_CATEGORY_NAMES, UK_COLOR_NAMES } from './taxonomy-names';
import { UK_PRODUCT_NAMES } from './translations';
import { join } from 'node:path';

export interface CatalogueProduct {
  id: number;
  slug: string;
  brand: string;
  name: string;
  price: number;
  oldPrice: number;
  category: string;
  colors: string[];
  sizes: string[];
  inStock: boolean;
  images: string[];
  description: string;
}

interface Catalogue {
  PRODUCTS: CatalogueProduct[];
  PRODUCT_CATEGORIES: string[];
  ALL_COLORS: { name: string; hex: string }[];
  ALL_SIZES: string[];
}

/**
 * The catalogue, exported from the Angular app that used to hold it.
 *
 * It stays a data file rather than becoming code: re-exporting it is then a
 * file swap, and the numeric ids it arrived with survive. Everything the demo
 * people below buy, review or wish for refers to a product by that id, so the
 * two files can be read side by side.
 */
const catalogue = JSON.parse(
  readFileSync(join(__dirname, '..', 'data', 'catalogue.json'), 'utf8'),
) as Catalogue;

export const CATALOGUE = catalogue;

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** Maps the catalogue's numeric ids onto the uuids the database handed out. */
export type ProductIds = Map<number, string>;

/**
 * Writes the categories and the products, and answers with the id map the rest
 * of the seed needs.
 *
 * Idempotent: everything is an upsert keyed on the slug, so a second run
 * changes nothing and a run after an export picks up exactly what changed.
 * Images are replaced wholesale rather than merged — an image dropped from the
 * export should disappear here too.
 */
export async function seedCatalogue(prisma: PrismaClient): Promise<ProductIds> {
  /*
   * Colours and sizes first: products point at them, and both are now rows an
   * administrator can add to rather than values compiled into the schema. The
   * seed only ensures the ones the catalogue needs exist — anything added
   * through the admin screens is left alone.
   */
  const colorIds = new Map<string, string>();

  for (const [index, color] of catalogue.ALL_COLORS.entries()) {
    const row = await prisma.color.upsert({
      where: { name: color.name },
      update: { hex: color.hex, position: index },
      create: { name: color.name, slug: slugify(color.name), hex: color.hex, position: index },
    });
    colorIds.set(color.name, row.id);

    const ukColor = UK_COLOR_NAMES[color.name];
    if (ukColor) {
      await prisma.colorTranslation.upsert({
        where: { colorId_locale: { colorId: row.id, locale: 'uk' } },
        update: { name: ukColor },
        create: { colorId: row.id, locale: 'uk', name: ukColor },
      });
    }
  }

  const sizeIds = new Map<string, string>();

  for (const [index, name] of catalogue.ALL_SIZES.entries()) {
    const row = await prisma.size.upsert({
      where: { name },
      update: { position: index },
      create: { name, slug: slugify(name), position: index },
    });
    sizeIds.set(name, row.id);
  }

  const categoryIds = new Map<string, string>();

  for (const [index, key] of catalogue.PRODUCT_CATEGORIES.entries()) {
    const slug = slugify(key);
    const category = await prisma.category.upsert({
      where: { key },
      update: {
        slug,
        name: key,
        position: index,
      },
      create: {
        key,
        slug,
        name: key,
        image: `https://picsum.photos/seed/krist-cat-${slug}/540/700`,
        position: index,
      },
    });
    categoryIds.set(key, category.id);
    await ukCategoryName(prisma, category.id, key);
  }

  // One level down, and only under the departments that have one.
  const subcategoryOf = new Map<string, string>();

  for (const [parentKey, children] of Object.entries(SUBCATEGORIES)) {
    const parentId = categoryIds.get(parentKey);
    if (!parentId) throw new Error(`Subcategories name an unknown department "${parentKey}"`);

    for (const [index, child] of children.entries()) {
      const row = await prisma.category.upsert({
        where: { key: child.key },
        update: { slug: child.slug, name: child.name, parentId, position: index },
        create: {
          key: child.key,
          slug: child.slug,
          name: child.name,
          parentId,
          position: index,
        },
      });

      categoryIds.set(child.key, row.id);
      await ukCategoryName(prisma, row.id, child.key);
      for (const slug of child.products) subcategoryOf.set(slug, child.key);
    }
  }
  const productIds: ProductIds = new Map();

  for (const item of catalogue.PRODUCTS) {
    const categories = categoriesFor(item, categoryIds, subcategoryOf.get(item.slug));

    const data = {
      brand: item.brand,
      name: item.name,
      description: item.description,
      price: item.price,
      // The kit gives every product a "was" price; only a real discount is one.
      oldPrice: item.oldPrice > item.price ? item.oldPrice : null,
      /*
       * The kit's data says in stock or not; the shop counts. Twenty-five of
       * everything that was on sale is enough for a demo to be ordered from
       * without running out, and nothing of what was not.
       */
      stock: item.inStock ? 25 : 0,
    };

    const colors = connectByName(item.colors, colorIds, item.slug, 'colour');
    const sizes = connectByName(item.sizes, sizeIds, item.slug, 'size');

    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      // `set` on the way in, so a colour dropped from the export is dropped
      // here too; `connect` on create, where there is nothing to replace.
      update: {
        ...data,
        categories: { set: categories },
        colors: { set: colors },
        sizes: { set: sizes },
      },
      create: {
        slug: item.slug,
        ...data,
        categories: { connect: categories },
        colors: { connect: colors },
        sizes: { connect: sizes },
      },
    });

    // Names only; the description falls back to the English one.
    const uk = UK_PRODUCT_NAMES[item.slug];
    if (uk) {
      await prisma.productTranslation.upsert({
        where: { productId_locale: { productId: product.id, locale: 'uk' } },
        update: { name: uk },
        create: { productId: product.id, locale: 'uk', name: uk },
      });
    }
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.createMany({
      data: item.images.map((url, position) => ({ productId: product.id, url, position })),
    });

    productIds.set(item.id, product.id);
  }

  console.log(
    `catalogue: ${categoryIds.size} categories, ${productIds.size} products with images, ` +
      `${Object.keys(UK_PRODUCT_NAMES).length} Ukrainian names`,
  );

  return productIds;
}

/**
 * Names into ids, loudly.
 *
 * A product naming a colour the seed never created is a mistake in the export,
 * and silently saving it without that colour would hide the mistake behind a
 * product that looks almost right.
 */
function connectByName(
  names: string[],
  ids: Map<string, string>,
  slug: string,
  noun: string,
): { id: string }[] {
  return names.map((name) => {
    const id = ids.get(name);
    if (!id)
      throw new Error(`Product ${slug} names a ${noun} the catalogue does not define: ${name}`);

    return { id };
  });
}

/**
 * A second category for the things that genuinely sit in two.
 *
 * The export gives every product exactly one, but a watch really is both a
 * watch and an accessory, and the catalogue can now say so. Only relationships
 * that hold by definition are listed here — nothing is guessed about who a
 * product is for.
 */
const ALSO_IN: Record<string, string[]> = {
  Watches: ['Accessories'],
  Belts: ['Accessories'],
  Wallets: ['Accessories'],
};

function categoriesFor(
  item: CatalogueProduct,
  categoryIds: Map<string, string>,
  subcategory?: string,
): { id: string }[] {
  // The department, anything it also belongs to, and its subcategory. Keeping
  // the department on the product is what lets a filter for "Men" find the
  // shoes under it without the query having to walk the tree.
  const keys = [item.category, ...(ALSO_IN[item.category] ?? [])];
  if (subcategory) keys.push(subcategory);

  return keys.map((key) => {
    const id = categoryIds.get(key);
    if (!id) throw new Error(`Product ${item.slug} names an unknown category "${key}"`);

    return { id };
  });
}

/** Writes the Ukrainian name for a category, if there is one for that key. */
async function ukCategoryName(
  prisma: PrismaClient,
  categoryId: string,
  key: string,
): Promise<void> {
  const name = UK_CATEGORY_NAMES[key];
  if (!name) return;

  await prisma.categoryTranslation.upsert({
    where: { categoryId_locale: { categoryId, locale: 'uk' } },
    update: { name },
    create: { categoryId, locale: 'uk', name },
  });
}
