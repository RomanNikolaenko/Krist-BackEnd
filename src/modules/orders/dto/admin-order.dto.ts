import { OrderStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * The four an administrator may set.
 *
 * CANCELLED is missing on purpose: calling an order off is the customer's, and
 * a shop that can do it from here would need to say why, refund it and tell
 * them — none of which this screen does.
 */
export const ADMIN_STATUSES = [
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.RETURNED,
] as const;

export class AdminOrderQueryDto {
  /** Declared so the whitelist keeps it; the decorator resolves the locale. */
  @IsOptional()
  @IsString()
  lang?: string;

  /** Matches an order number, or the name or email of who placed it. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;
}

export class SetOrderStatusDto {
  @IsEnum(ADMIN_STATUSES, {
    message: `Status has to be one of ${ADMIN_STATUSES.join(', ')}`,
  })
  status!: (typeof ADMIN_STATUSES)[number];
}
