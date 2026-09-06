# Krist — Backend

Authentication and authorization API for the Krist storefront.
NestJS · TypeScript · Prisma · PostgreSQL · Redis.

The browser never holds a token. Authentication is a **server-side session**
addressed by an opaque value in an `HttpOnly` cookie; PostgreSQL holds the
session, the user, the roles and the permissions. No JWT goes near
`localStorage` or `sessionStorage`.

## Running it

```bash
cp .env.example .env          # then set SESSION_SECRET
docker compose up -d          # postgres + redis
npm install
npm run prisma:migrate        # creates the schema
npm run db:seed               # roles, permissions, and a dev customer
npm run start:dev             # http://localhost:3000/api
```

**Without Docker.** `npm run db:local` downloads a real PostgreSQL and runs it as
a child process against `.local/postgres` — the same server the compose file
starts, supervised by node instead, so migrations and constraints behave exactly
as they will in production. Redis is then simply absent, which costs only rate
limiting: the API logs the degradation and carries on, because taking
authentication offline along with the cache is the worse of the two failures.

```bash
npm run db:local              # postgres, no Docker, no admin rights
npm run prisma:deploy && npm run db:seed
npm run start:dev
```

`npm run lint` · `npm test` · `npm run build`

## The request path

```
Angular  ──HTTPS──▶  HttpOnly cookie  ──▶  NestJS
                                            │
                    CsrfGuard ─▶ RateLimitGuard ─▶ SessionGuard
                                            │
                            PostgreSQL session ─▶ user ─▶ roles ─▶ permissions
                                            │
                              RolesGuard ─▶ PermissionsGuard ─▶ controller
```

The guards are global and run in that order, declared in `app.module.ts`. A new
controller is therefore **closed until someone opens it** with `@Public()` —
the opposite default fails open, and fails silently.

Authentication and authorization stay separate. `SessionGuard` answers only
"who is this?" and attaches the answer, flattened, to the request. The two
guards after it read that answer and never touch the database.

## Session lifecycle

|             |                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| **Issued**  | on login and on password change — always a _new_ row, never the one the caller arrived with                   |
| **Stored**  | as `sha256(token)`; the token itself exists in the clear only in the Set-Cookie header and the request cookie |
| **Bounded** | `expiresAt` is the absolute ceiling; the idle window is measured from `lastUsedAt` at read time               |
| **Slid**    | `lastUsedAt` updates at most once a minute, so a busy tab is not a write per click                            |
| **Ended**   | revoked individually, or all at once by bumping `User.sessionEpoch`                                           |

`sessionEpoch` is what makes "sign out everywhere" instant. Every session
records the epoch it was born under; a password change increments the user's,
and every older session fails its next lookup without those rows being read.

## Security decisions worth knowing

**Cookies.** `HttpOnly`, `Secure` (forced on in production — the config refuses
to boot otherwise), `SameSite=Lax` by default, `Path=/`, and a `Max-Age` tied
to `SESSION_MAX_AGE`.

**CSRF.** `HttpOnly` is not CSRF protection: it stops a script _reading_ the
cookie, not another site making the browser _send_ it. So writes carry a
double-submit token — the one deliberately readable cookie, echoed in
`X-CSRF-Token` — plus an Origin/Referer check. Two mechanisms because each
covers the other's gap: `SameSite` is the browser's promise rather than ours,
and the Origin header is absent on some legitimate requests.

**CORS.** `credentials: true` with an explicit origin list. Never a wildcard —
browsers reject that pair anyway — and never a reflection of whatever `Origin`
arrived, which would allow the whole internet while looking specific.

**Enumeration.** Registration, password reset and resend all answer the same
for a known and an unknown address. Login gives one message for both failures
_and hashes a dummy password when the user does not exist_, so the timing does
not leak what the wording hides.

**Rate limiting.** Per IP and per submitted address, counted in Redis. No
endpoint locks an account: that would hand anyone a way to lock out a stranger.
If Redis is down the limiter fails open and says so loudly — taking login
offline with the cache is the worse failure.

**Passwords.** Argon2id at OWASP's baseline (19 MiB, t=2, p=1). One-way, salted,
never encrypted.

**Errors.** Anything that is not an `HttpException` becomes a bare 500. A Prisma
unique-constraint error names the column and the value that collided, and
letting it through would make registration an enumeration oracle by accident.

## Endpoints

All under `/api`. ✱ = no session required.

| Method | Path                        |                                               |
| ------ | --------------------------- | --------------------------------------------- |
| POST ✱ | `/auth/register`            | create an account, send verification          |
| POST ✱ | `/auth/login`               | verify credentials, issue a session           |
| POST   | `/auth/logout`              | revoke this session                           |
| POST   | `/auth/logout-all`          | revoke every session                          |
| GET ✱  | `/auth/me`                  | `{ authenticated, user? }` — the startup call |
| POST ✱ | `/auth/verify-email`        | consume a verification token                  |
| POST ✱ | `/auth/resend-verification` | issue a fresh one                             |
| POST ✱ | `/auth/forgot-password`     | send a reset link                             |
| POST ✱ | `/auth/reset-password`      | set a new password, end all sessions          |
| POST   | `/auth/change-password`     | requires the current password                 |
| GET    | `/auth/sessions`            | signed-in devices                             |
| DELETE | `/auth/sessions/:id`        | revoke one, own sessions only                 |
| GET ✱  | `/health`                   | database and cache reachability               |

`@Public()` lifts the session requirement only. CSRF still applies to every
write — login and password reset are precisely what a cross-site form wants.

## Authorization

Roles describe people; permissions are what the code checks. Guards read
permissions, so re-cutting the roles later is a data change rather than a
search through controllers.

```ts
@RequirePermissions('orders.write')   // every listed permission is required
@RequireRoles('ADMIN', 'MANAGER')     // any one of them is enough
```

Seeded roles: `CUSTOMER`, `SUPPORT`, `MANAGER`, `ADMIN`. Permissions:
`products.read|write`, `orders.read|write`, `users.read|write`. Only what the
storefront needs today — an unused permission is a promise the code has not kept.

## Layout

```
prisma/schema.prisma        users, roles, permissions, sessions, tokens, audit
prisma/seed.ts              roles and permissions, idempotent
src/config/                 env schema (zod) and the typed reader
src/infra/prisma|redis|mail infrastructure, each behind one service
src/common/guards/          csrf, rate limit, session, roles, permissions
src/common/middleware/      request id, http logging
src/common/filters/         one error shape for the whole API
src/modules/auth/           the flows, the session service, the DTOs
src/modules/rbac/           the roles and permissions vocabulary
src/modules/audit/          the security trail
```

## Configuration

Every setting is validated at boot by `src/config/env.schema.ts`; the process
refuses to start on a bad one. See `.env.example` for the full list — the ones
that matter most are `SESSION_SECRET` (≥ 32 chars), `DATABASE_URL`, `REDIS_URL`,
`FRONTEND_URL`, `COOKIE_SAME_SITE`, `SESSION_IDLE_TIMEOUT` and `SESSION_MAX_AGE`.

## Not built yet

- **TOTP.** The tables (`two_factor_auth`, `two_factor_recovery_codes`) and the
  login branch exist so it can be switched on without a migration. Nothing
  generates or verifies codes.
- **Integration tests.** The unit suite covers the security rules — session
  expiry, epoch invalidation, CSRF, guards, config. End-to-end tests against a
  live database are not written yet.
