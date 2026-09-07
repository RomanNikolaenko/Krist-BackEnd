import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from '../types/request-user';

/**
 * The identity, if there is one.
 *
 * `@CurrentUser()` throws when nobody is signed in, which is right on a guarded
 * route and wrong on an open one. A public page still wants to know who is
 * reading it — a review list has to mark which entries the viewer wrote and
 * which they have already found useful — and the session guard resolves the
 * cookie on public routes precisely so that answer is available here.
 */
export const MaybeUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | null =>
    ctx.switchToHttp().getRequest<Request>().user ?? null,
);
