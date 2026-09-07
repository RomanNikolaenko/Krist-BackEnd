import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

/**
 * Bootstrap. Four things here decide whether cookie-based authentication is
 * safe or theatre, so each one is spelled out rather than left to a default.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);
  const logger = new Logger('Bootstrap');

  /*
   * 1. Proxy trust. Express only believes X-Forwarded-For when told to, and
   *    that trust has to be earned: without a proxy in front, any client can
   *    name its own IP and walk past rate limiting. Off unless configured.
   */
  if (config.trustProxy) app.set('trust proxy', 1);

  /*
   * 2. Cookies, parsed and signed. The signature is not what protects the
   *    session — the token is unguessable on its own — but it means a tampered
   *    cookie is discarded before it reaches a database lookup.
   */
  app.use(cookieParser(config.sessionSecret));

  /*
   * 3. Security headers. CSP is left off here because this process serves an
   *    API, not documents; the Angular app sets its own. What matters for a
   *    JSON API is nosniff, frameguard and a referrer policy that does not
   *    leak reset tokens in the Referer of an outbound link.
   */
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  /*
   * 4. CORS. The single most common way session auth is broken.
   *
   *    `credentials: true` is what lets the browser attach the session cookie
   *    to a cross-origin request — and a browser refuses that combination with
   *    `Access-Control-Allow-Origin: *`, so the origin list is explicit. It is
   *    also checked rather than echoed: reflecting whatever Origin arrived
   *    would allow every site on the internet while looking specific.
   *
   *    The CSRF header has to be listed, or the preflight fails and every
   *    mutating request dies before it is sent.
   */
  const allowed = config.corsOrigins;
  app.enableCors({
    origin: (origin, callback) => {
      // Same-origin and server-to-server requests carry no Origin at all.
      if (!origin || allowed.includes(origin)) return callback(null, true);

      /*
       * Refuse by withholding the header, not by throwing. Throwing here turns
       * a rejected origin into an unhandled error and the caller gets a 500
       * reading "something went wrong" — which is untrue, fills the log with
       * fake server faults, and hides real ones.
       *
       * Omitting the header is the actual mechanism anyway: the browser sees no
       * Access-Control-Allow-Origin and blocks the response itself. A non-browser
       * client ignores CORS entirely, and for those the CsrfGuard's own origin
       * check answers with a clean 403.
       */
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  /*
   * Uploaded avatars.
   *
   * Served by the API rather than the browser app so the file and the row
   * that points at it stay together, and deliberately outside the /api
   * prefix: this is a file, not an endpoint. helmet already runs above, so
   * these responses carry nosniff — which is what stops a stored image from
   * being sniffed into something executable.
   */
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    index: false,
    redirect: false,
    maxAge: '7d',
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip anything the DTO does not declare, and refuse the request if it
      // was sent — mass assignment is not a risk we accept quietly.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableShutdownHooks();

  await app.listen(config.port);
  logger.log(`API on port ${config.port} (${config.nodeEnv})`);
  logger.log(`CORS origins: ${allowed.join(', ')}`);
}

void bootstrap();
