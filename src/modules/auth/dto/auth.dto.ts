import { Transform } from 'class-transformer';
import { IsEmail, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { IsStrongPassword } from './password.rules';

/**
 * Normalised once, here, so every lookup downstream compares like with like.
 * Without it "Robert@Example.com " registers twice.
 */
const NormaliseEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

export class RegisterDto {
  @NormaliseEmail()
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  email!: string;

  @IsStrongPassword()
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;
}

export class LoginDto {
  @NormaliseEmail()
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  // No policy here on purpose: an existing password predates the current rules,
  // and validating it would tell the caller what the rules are.
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MaxLength(200)
  token!: string;
}

export class ResendVerificationDto {
  @NormaliseEmail()
  @IsEmail()
  email!: string;
}

export class ForgotPasswordDto {
  @NormaliseEmail()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(200)
  token!: string;

  @IsStrongPassword()
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @IsStrongPassword()
  newPassword!: string;
}

export class SessionIdParam {
  @IsUUID()
  id!: string;
}
