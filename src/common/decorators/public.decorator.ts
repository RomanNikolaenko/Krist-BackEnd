import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../constants';

/**
 * Opts a handler out of the global session guard.
 *
 * The guard is applied globally so that forgetting a decorator leaves a route
 * closed rather than open — the failure mode of the alternative is a public
 * endpoint nobody meant to ship.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
