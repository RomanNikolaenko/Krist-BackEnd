import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** `#rgb`, `#rrggbb` or `#rrggbbaa` — what a CSS colour is allowed to be here. */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export class CreateColorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @Matches(HEX, { message: 'The swatch has to be a hex colour, e.g. #4a4ae4' })
  hex!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;
  /** Names in other languages. The base one is the row's own `name`. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxonomyTranslationDto)
  translations?: TaxonomyTranslationDto[];
}

export class UpdateColorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @Matches(HEX, { message: 'The swatch has to be a hex colour, e.g. #4a4ae4' })
  hex?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;
  /** Names in other languages. The base one is the row's own `name`. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxonomyTranslationDto)
  translations?: TaxonomyTranslationDto[];
}

export class CreateSizeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  /**
   * Where it sits in the list. Sizes have an order that is not alphabetical —
   * S before M before L — and nothing but a human knows what it is.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;
}

export class UpdateSizeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
  /**
   * The department this sits inside, if any. Absent means a department of its
   * own — the shop nests one level and no further.
   */
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  image?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;
  /** Names in other languages. The base one is the row's own `name`. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxonomyTranslationDto)
  translations?: TaxonomyTranslationDto[];
}

/**
 * The key is absent on purpose. It is what shop URLs filter on, so renaming a
 * category changes the label and leaves every shared link working.
 */
export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  image?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;
  /** Names in other languages. The base one is the row's own `name`. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxonomyTranslationDto)
  translations?: TaxonomyTranslationDto[];
}

/**
 * A taxonomy row's name in one language.
 *
 * A list rather than an object keyed by locale, for the same reason product
 * translations are: class-validator can describe an array element but not the
 * open-ended keys of a dictionary.
 */
export class TaxonomyTranslationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  locale!: string;

  @IsString()
  @MaxLength(60)
  name!: string;
}
