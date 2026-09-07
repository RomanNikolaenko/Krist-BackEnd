import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One line of a basket.
 *
 * Note what is missing: the price. The client says what and how many, the
 * server says what it costs. A total assembled from numbers the browser sent is
 * a discount anyone can give themselves with the developer tools open.
 */
export class OrderLineDto {
  @IsUUID()
  productId!: string;

  /**
   * Names, not a fixed list: the shop can be given a new colour or size without
   * this file being redeployed. Whether a product comes in the one asked for is
   * checked against that product, which is the only thing that knows.
   */
  @IsString()
  @MaxLength(60)
  size!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  color?: string;

  @IsInt()
  @Min(1)
  @Max(99)
  qty!: number;
}

export class PlaceOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lines!: OrderLineDto[];

  @IsOptional()
  @IsUUID()
  addressId?: string;

  /** The code as typed. What it is worth is decided here, not by the client. */
  @IsOptional()
  @IsString()
  discountCode?: string;
}
