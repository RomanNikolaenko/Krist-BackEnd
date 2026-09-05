import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * One line per request, written when the response finishes so it can carry the
 * status and the duration.
 *
 * Only the method, path, status, duration and request id — never the body, and
 * never the query string, because both routinely carry tokens and passwords.
 */
@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Http');

  use(request: Request, response: Response, next: NextFunction): void {
    const started = Date.now();

    response.on('finish', () => {
      const { method, baseUrl, path } = request;
      const line = `${method} ${baseUrl}${path} ${response.statusCode} ${Date.now() - started}ms`;
      const message = request.requestId ? `${line} [${request.requestId}]` : line;

      if (response.statusCode >= 500) this.logger.error(message);
      else if (response.statusCode >= 400) this.logger.warn(message);
      else this.logger.log(message);
    });

    next();
  }
}
