import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * One password policy, applied everywhere a password is accepted.
 *
 * Length does most of the work — it is the only factor that reliably raises
 * the cost of guessing. The character classes are here because the design asks
 * for a policy, not because they add much; the upper bound exists so a
 * megabyte of input cannot turn Argon2id into a denial of service.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const IsStrongPassword = () =>
  applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN, {
      message: `Password must be at least ${PASSWORD_MIN} characters`,
    }),
    MaxLength(PASSWORD_MAX),
    Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' }),
    Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' }),
    Matches(/[0-9]/, { message: 'Password must contain a digit' }),
  );
