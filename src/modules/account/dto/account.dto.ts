import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Matches the storefront's own field: digits, spaces and the usual punctuation. */
const PHONE = /^[\d\s()+-]{7,20}$/;

/**
 * What someone may change about themselves.
 *
 * Not the email address. Moving an account to a new address is an
 * authentication change, not a profile edit — it needs the new address proved
 * and the old one told — so it belongs with the verification flow rather than
 * behind a field that saves on blur.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE, { message: 'That does not look like a phone number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'The avatar has to be a URL' })
  @MaxLength(500)
  avatarUrl?: string;
}

export class AddressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @Matches(PHONE, { message: 'That does not look like a phone number' })
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  line1!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  area!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;

  /** Five digits, the same rule the address form enforces in the browser. */
  @IsString()
  @Matches(/^\d{5}$/, { message: 'A postcode is five digits' })
  pin!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  state!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export const CARD_BRANDS = ['VISA', 'MASTERCARD'] as const;

/**
 * A card as this application is willing to know it.
 *
 * There is no field for the number, and that is the point: the last four digits
 * are everything the saved-cards screen shows, and a full number in the request
 * body would be a full number in the logs.
 */
export class SavedCardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  holder!: string;

  @IsIn(CARD_BRANDS)
  brand!: (typeof CARD_BRANDS)[number];

  @IsString()
  @Matches(/^\d{4}$/, { message: 'Only the last four digits' })
  last4!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  expiryMonth!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  expiryYear!: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class WishlistItemDto {
  @IsUUID()
  productId!: string;
}

export class MergeWishlistDto {
  @IsUUID('4', { each: true })
  productIds!: string[];
}

/**
 * Closing the account.
 *
 * The password is asked for again even though the caller is already signed in.
 * This is the one request in the application that cannot be undone, and a live
 * session on an unattended machine should not be enough to spend someone
 * else's order history.
 */
export class DeleteAccountDto {
  @IsString()
  @MinLength(1, { message: 'Enter your password to confirm' })
  password!: string;
}
