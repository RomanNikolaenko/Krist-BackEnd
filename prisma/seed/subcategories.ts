/**
 * One level of departments, derived from what the catalogue actually holds.
 *
 * Nothing here is invented: every subcategory is named after products that are
 * already in the export, and every product listed under one is placed by what
 * its own name says it is. A product keeps its department as well as its
 * subcategory, so filtering by "Men" still finds the shoes underneath it
 * without the query having to walk the tree.
 *
 * `key` is qualified because it is unique across the whole table and shared by
 * more than one department — Men and Women both sell shoes. `name` is the short
 * label the menu and the breadcrumbs show.
 */
export interface Subcategory {
  key: string;
  name: string;
  slug: string;
  /** Slugs of the products that belong in it. */
  products: string[];
}

export const SUBCATEGORIES: Record<string, Subcategory[]> = {
  Men: [
    {
      key: 'Men T-Shirts',
      name: 'T-Shirts',
      slug: 'men-t-shirts',
      products: [
        'everyday-training-tee-24',
        'polo-collar-t-shirt-3',
        'printed-cotton-crew-tee-5',
        'printed-cotton-t-shirt-1',
      ],
    },
    {
      key: 'Men Shirts',
      name: 'Shirts',
      slug: 'men-shirts',
      products: [
        'slim-fit-denim-shirt-17',
        'slim-fit-formal-shirt-44',
        'tailored-cotton-casual-shirt-6',
      ],
    },
    {
      key: 'Men Trousers',
      name: 'Trousers',
      slug: 'men-trousers',
      products: ['casual-blue-jeans-9', 'formal-cotton-trousers-43'],
    },
    {
      key: 'Men Shoes',
      name: 'Shoes',
      slug: 'men-shoes',
      products: [
        'casual-shoe-for-men-12',
        'comfort-walk-loafers-46',
        'court-vision-sneakers-29',
        'men-adi-dash-running-shoes-4',
      ],
    },
    {
      key: 'Men Blazers',
      name: 'Blazers',
      slug: 'men-blazers',
      products: ['printed-blazer-for-men-15'],
    },
  ],

  Women: [
    {
      key: 'Women Dresses',
      name: 'Dresses',
      slug: 'women-dresses',
      products: ['floral-embroidered-maxi-dress-10'],
    },
    {
      key: 'Women Tops',
      name: 'Tops',
      slug: 'women-tops',
      products: ['satin-wrap-blouse-28', 'cotton-straight-kurta-25'],
    },
    {
      key: 'Women Skirts',
      name: 'Skirts',
      slug: 'women-skirts',
      products: ['pleated-midi-skirt-26'],
    },
    {
      key: 'Women Jackets',
      name: 'Jackets',
      slug: 'women-jackets',
      products: ['cropped-denim-jacket-27'],
    },
    {
      key: 'Women Shoes',
      name: 'Shoes',
      slug: 'women-shoes',
      products: ['go-walk-slip-on-30', 'pointed-heel-pumps-45', 'women-sandals-7'],
    },
  ],

  Kids: [
    {
      key: 'Kids T-Shirts',
      name: 'T-Shirts',
      slug: 'kids-t-shirts',
      products: ['red-printed-t-shirt-14'],
    },
    {
      key: 'Kids Shirts',
      name: 'Shirts',
      slug: 'kids-shirts',
      products: ['boys-checked-shirt-38'],
    },
    {
      key: 'Kids Dresses',
      name: 'Dresses',
      slug: 'kids-dresses',
      products: ['girls-party-frock-39', 'girls-pink-moana-printed-dress-8'],
    },
    {
      key: 'Kids Sets',
      name: 'Sets',
      slug: 'kids-sets',
      products: ['kids-dungaree-set-37'],
    },
  ],
};
