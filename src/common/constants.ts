/** Cookie carrying the opaque session token. Never readable from JavaScript. */
export const SESSION_COOKIE = 'krist_session';

/**
 * Cookie carrying the CSRF token. Deliberately readable — the browser app has
 * to echo it back in a header, which is the whole double-submit mechanism.
 */
export const CSRF_COOKIE = 'krist_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Metadata keys the guards read off handlers. */
export const IS_PUBLIC_KEY = 'auth:public';
export const ROLES_KEY = 'auth:roles';
export const PERMISSIONS_KEY = 'auth:permissions';
export const RATE_LIMIT_KEY = 'auth:rate-limit';
