import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
  retryAfter?: number;
}

/**
 * One error shape for the whole API, and a wall against accidental disclosure.
 *
 * Anything that is not an HttpException becomes a bare 500. That is the point:
 * a Prisma unique-constraint error carries the column and the value that
 * collided, and letting it through would turn registration into an email
 * enumeration oracle without anyone writing a line of code to that effect.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorBody = {
      statusCode: status,
      error: statusName(status),
      message: 'Something went wrong',
      requestId: request.requestId,
    };

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        body.message = payload;
      } else if (payload && typeof payload === 'object') {
        const shaped = payload as Partial<ErrorBody>;
        body.message = shaped.message ?? exception.message;
        if (shaped.error) body.error = shaped.error;
        if (shaped.retryAfter) body.retryAfter = shaped.retryAfter;
      }
    }

    if (status >= 500) {
      // The detail goes to the log, where operators can see it, and nowhere
      // near the response.
      this.logger.error(
        `${request.method} ${request.url} — ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    if (body.retryAfter) response.setHeader('Retry-After', String(body.retryAfter));
    response.status(status).json(body);
  }
}

/** HttpStatus is a numeric enum, so the reverse lookup needs a widened index. */
function statusName(status: number): string {
  return (HttpStatus as unknown as Record<number, string>)[status] ?? 'ERROR';
}
