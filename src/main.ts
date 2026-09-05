import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
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
      return callback(new Error(`Origin ${origin} is not allowed`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
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
