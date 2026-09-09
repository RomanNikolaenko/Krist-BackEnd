import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const MAX_PRICE = 1_000_000;

/**
 * An image belongs to a product by its URL and its place in the order.
 *
 * Position is implicit — the array order is the gallery order — because a
 * screen that lets someone drag images around should not also have to keep a
 * separate number in step with where they dropped them.
 */
export class ProductImageInput {
  @IsUrl({ require_protocol: true }, { message: 'Each image has to be a URL' })
  @MaxLength(500)
  url!: string;
}

/**
 * What an administrator may say about a product.
 *
 * The slug is absent on purpose: it is derived from the brand and the name so
 * two people cannot invent conflicting ones, and it is the address customers
 * bookmark. Changing it deliberately is a separate decision, not a side effect
 * of fixing a typo in the title.
 */
export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  brand!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description!: string;

  /** Two decimal places, because that is what the column stores. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRICE)
  price!: number;

  /**
   * What it used to cost. Null clears it, and a value at or below the current
   * price is refused by the service — a "discount" that is not one is a lie the
   * shop would be telling on every card.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRICE)
  oldPrice?: number | null;

  /**
   * The stable keys of every category it belongs to, e.g. ["Watches", "Men"].
   * At least one, because a product in no category cannot be browsed to.
   */
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  categories!: string[];

  /** Translations, one entry per locale. The base one is the columns above. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductTranslationDto)
  translations?: ProductTranslationDto[];

  /**
   * Colour and size names, checked against the tables rather than a list
   * compiled into this file — an administrator can add to both, and a DTO that
   * knew the answer would have to be redeployed every time they did.
   */
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  colors!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  sizes!: string[];

  /** How many there are. Zero is what takes it off sale. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ProductImageInput)
  images!: ProductImageInput[];
}

/**
 * Every field optional, and written out rather than derived, so that "absent"
 * and "cleared" stay distinguishable: omitting `oldPrice` leaves it alone,
 * sending null removes the discount.
 */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRICE)
  price?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRICE)
  oldPrice?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  categories?: string[];

  /** Translations, one entry per locale. The base one is the columns above. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductTranslationDto)
  translations?: ProductTranslationDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  colors?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  sizes?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ProductImageInput)
  images?: ProductImageInput[];
}

/** The admin list: a search box and a page number, nothing clever. */
export class AdminProductQueryDto {
  /**
   * Which language to name the categories in. Declared so the whitelist does
   * not reject it; the decorator resolves it and falls back on its own.
   */
  @IsOptional()
  @IsString()
  lang?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/**
 * One language of a product, as the form sends it.
 *
 * A list of these rather than an object keyed by locale: class-validator can
 * describe the shape of an array element, but not the open-ended keys of a
 * dictionary, and the whitelist then rejects every locale as an unknown
 * property. The locale is a field here, which also gets it validated.
 *
 * Both text fields are optional and nullable: a translator works through the
 * names first and the descriptions later, and the storefront falls back field
 * by field in the meantime.
 */
export class ProductTranslationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  locale!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;
}
