import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_KEY } from '../constants';

export interface RateLimitOptions {
  /** Which configured budget to spend — see AppConfigService.rateLimits. */
  readonly bucket: 'login' | 'signup' | 'reset' | 'contact';
  /**
   * Also count per submitted identifier, not only per IP. Without it a
   * botnet spreads a credential-stuffing run thin enough to slip the IP limit.
   */
  readonly keyFrom?: 'ip' | 'ip+email';
}

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
