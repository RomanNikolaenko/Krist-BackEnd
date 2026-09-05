import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestSession, RequestUser } from '../types/request-user';

/**
 * Hands the controller the identity the guard already resolved. Throws rather
 * than returning undefined, so a handler that asks for a user on a route that
 * turns out to be public fails loudly instead of dereferencing nothing.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.user) throw new UnauthorizedException();
    return request.user;
  },
);

export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestSession => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.authSession) throw new UnauthorizedException();
    return request.authSession;
  },
);
