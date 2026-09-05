/**
 * The identity the session guard attaches to the request — and nothing more.
 *
 * Deliberately not the Prisma `User`: a password hash has no business travelling
 * on a request object, and the roles and permissions are flattened here so the
 * authorization guards never have to touch the database again.
 */
export interface RequestUser {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly status: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

export interface RequestSession {
  readonly id: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date;
  readonly expiresAt: Date;
}

declare module 'express' {
  interface Request {
    user?: RequestUser;
    authSession?: RequestSession;
    /** Correlates every log line and audit row belonging to one request. */
    requestId?: string;
  }
}
