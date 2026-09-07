import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const SORT_KEYS = ['latest', 'price-asc', 'price-desc', 'rating'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const PAGE_SIZE = 16;
const MAX_PAGE_SIZE = 48;

/**
 * Turns `?colors=Red,Black` into an array.
 *
 * Repeated parameters (`?colors=Red&colors=Black`) arrive as an array already,
 * so both spellings work and the client can use whichever its HTTP layer emits.
 */
const csv = () =>
  Transform(({ value }: { value: unknown }) => {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    }
    return undefined;
  });

/**
 * Everything the shop page can ask for.
 *
 * Every field is optional and every one has a sane default, because this is the
 * query behind a URL people share: a link missing half its parameters should
 * still open a working page rather than a validation error.
 */
export class ProductQueryDto {
  /**
   * Which language to answer in. Declared so the whitelist validator does not
   * reject the parameter, but deliberately not checked against the list here:
   * `@RequestLocale()` resolves it and falls back to the base language, and a
   * shared link naming a language the shop has since dropped should open the
   * shop rather than a validation error.
   */
  @IsOptional()
  @IsString()
  lang?: string;
  @IsOptional()
  @csv()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @IsOptional()
  @csv()
  @IsArray()
  @IsString({ each: true })
  colors?: string[];

  @IsOptional()
  @csv()
  @IsArray()
  @IsString({ each: true })
  sizes?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsIn(SORT_KEYS)
  sort?: SortKey;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  /** Free-text search across the brand and the product name. */
  @IsOptional()
  @IsString()
  q?: string;
}
