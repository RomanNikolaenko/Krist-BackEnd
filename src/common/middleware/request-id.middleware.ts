import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Tags every request so a log line, an audit row and an error response can be
 * tied together afterwards. Honours an inbound X-Request-Id from a trusted
 * proxy, and echoes the value back so the caller can quote it in a bug report.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const inbound = request.headers['x-request-id'];
    const id = typeof inbound === 'string' && inbound.length <= 100 ? inbound : randomUUID();

    request.requestId = id;
    response.setHeader('X-Request-Id', id);
    next();
  }
}
