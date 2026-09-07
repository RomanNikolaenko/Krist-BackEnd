import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The languages the catalogue can answer in.
 *
 * The base one is both the source text a product is written in and the fallback
 * for every field a translator has not reached yet.
 */
export const LOCALES = ['en', 'uk'] as const;
export type Locale = (typeof LOCALES)[number];
export const BASE_LOCALE: Locale = 'en';

const KNOWN = new Set<string>(LOCALES);

/**
 * Which language to answer in.
 *
 * Read from `?lang=` rather than `Accept-Language`, because the storefront's
 * choice is a setting the reader made, not a property of their browser — and
 * because a query parameter is part of the URL, which is what makes the
 * client's cached resource re-fetch when the setting changes. The header is
 * still consulted as a fallback for a request that names nothing.
 *
 * Anything unrecognised resolves to the base language. A bookmark carrying a
 * language that has since been dropped should show the shop, not an error.
 */
export const RequestLocale = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Locale => {
    const request = ctx.switchToHttp().getRequest<Request>();

    const asked = request.query?.lang;
    const named = typeof asked === 'string' ? asked : undefined;

    return resolve(named) ?? resolve(headerLanguage(request)) ?? BASE_LOCALE;
  },
);

/** The first entry of `Accept-Language`, without its quality value or region. */
function headerLanguage(request: Request): string | undefined {
  const header = request.headers['accept-language'];
  if (typeof header !== 'string') return undefined;

  return header.split(',')[0]?.split(';')[0];
}

/** `uk-UA` and `UK` both mean `uk`; anything unknown means nothing. */
function resolve(value: string | undefined): Locale | undefined {
  if (!value) return undefined;

  const short = value.trim().toLowerCase().split('-')[0];
  return KNOWN.has(short) ? (short as Locale) : undefined;
}
