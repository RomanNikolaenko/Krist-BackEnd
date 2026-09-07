/**
 * Ukrainian names for the seeded vocabulary.
 *
 * These lived in the front end's dictionary, which was wrong in a way that only
 * showed up once an administrator could add to the taxonomy: a category created
 * through the admin panel had no key in any compiled file and could never be
 * translated. They belong beside the rows they name.
 *
 * Keyed by the row's stable key, not by its display name — two departments both
 * sell shoes.
 */
export const UK_CATEGORY_NAMES: Record<string, string> = {
  Men: 'Чоловікам',
  Women: 'Жінкам',
  Kids: 'Дітям',
  Bags: 'Сумки',
  Belts: 'Ремені',
  Wallets: 'Гаманці',
  Watches: 'Годинники',
  Accessories: 'Аксесуари',
  'Winter Wear': 'Зимовий одяг',

  'Men T-Shirts': 'Футболки',
  'Men Shirts': 'Сорочки',
  'Men Trousers': 'Штани',
  'Men Shoes': 'Взуття',
  'Men Blazers': 'Піджаки',

  'Women Dresses': 'Сукні',
  'Women Tops': 'Топи',
  'Women Skirts': 'Спідниці',
  'Women Jackets': 'Куртки',
  'Women Shoes': 'Взуття',

  'Kids T-Shirts': 'Футболки',
  'Kids Shirts': 'Сорочки',
  'Kids Dresses': 'Сукні',
  'Kids Sets': 'Комплекти',
};

export const UK_COLOR_NAMES: Record<string, string> = {
  Red: 'Червоний',
  Blue: 'Синій',
  Orange: 'Помаранчевий',
  Black: 'Чорний',
  Green: 'Зелений',
  Yellow: 'Жовтий',
};
