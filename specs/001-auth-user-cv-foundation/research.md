# Research: Authentication and User-Owned CV Foundation

All technical-context unknowns are resolved below. No `NEEDS CLARIFICATION` remains.

## Repository findings (inspected 2026-10-05)

- `apps/api/prisma/schema.prisma` already defines `User` (unique `email`, `passwordHash`), `Session` (`tokenHash` unique, `expiresAt`, cascade FK) and `Cv` (`userId` FK cascade, **`targetRole String` required**). The init migration matches. The spec says target role is optional, so one migration is needed.
- `apps/api/src/infrastructure/prisma/` provides a global `PrismaModule`/`PrismaService` (Prisma 7 + `@prisma/adapter-pg`). It reads `process.env.DATABASE_URL` directly; left unchanged.
- `apps/api/src/modules/` exists and is empty. `app.module.ts` registers only `ConfigModule` and `PrismaModule`; `app.controller.ts`/`app.service.ts` are unused starter files, and `test/app.e2e-spec.ts` still asserts the starter `Hello World!` route.
- `main.ts` sets the `api` global prefix and uses Fastify; no cookie plugin, CORS or exception filter yet.
- `vitest.config.ts` runs `*.spec.ts`; `vitest.config.e2e.ts` runs `*.e2e-spec.ts`. Running `pnpm test` passes the existing spec, which injects `AppService` through the constructor, so Nest DI works under this Vitest setup without SWC.
- `.oxlintrc.json` sets `typescript/no-explicit-any` to `off`, contradicting constitution II.
- `prisma7.config.ts` is not the default Prisma config filename, and `package.json` has no Prisma scripts.
- `docker-compose.yaml` runs Postgres 17 only; a dev container is already running. `.env` provides `DATABASE_URL`.
- `apps/web` is the untouched `create-next-app` scaffold (Next 16.3, React 19.2, Tailwind 4). Its `AGENTS.md` says this Next.js has breaking changes and to read the bundled docs before writing code. `packages/shared` contains only an empty `src/`.

## Decisions

### D-1 Password hashing: Argon2id via `@node-rs/argon2`

- **Decision**: `@node-rs/argon2` with library defaults (Argon2id, parameters at the OWASP minimum).
- **Rationale**: `backend.md` requires Argon2. This package ships prebuilt binaries via optional packages, so it needs no install script, which matters because pnpm 11 here blocks build scripts unless allow-listed (`pnpm-workspace.yaml`).
- **Alternatives**: `argon2` (node-argon2) is equally valid but needs build-script allowance; `bcrypt`/`scrypt` do not satisfy the Argon2 rule.
- **Risk / fallback**: confirm the package imports under ESM on this machine in step 0; if not, use `argon2` and add it to `allowBuilds`.
- **Verified (T001, 2026-10-05)**: `@node-rs/argon2` ^2.2.1 installs without a build script, imports under ESM in Node 24 and under Vitest 4, and produces `$argon2id$v=19$m=19456,t=2,p=1` hashes that verify correctly. No fallback needed; `argon2` is not installed.

### D-2 Session token and storage

- **Decision**: 32 random bytes (`crypto.randomBytes`), base64url in the cookie; store `sha256(token)` hex in `Session.tokenHash` (already unique-indexed).
- **Rationale**: Meets FR-016/FR-017. A fast hash is appropriate because the input is 256 bits of entropy; a slow KDF would add latency with no security gain.
- **Alternatives**: JWT (stateless, cannot be revoked at logout, violates server-side session requirement); storing the raw token (rejected by FR-017); Argon2 on the token (needless cost).

### D-3 Session lifetime and invalidation

- **Decision**: 7-day fixed expiry set at creation. Logout deletes the row. Lookup requires `expiresAt > now`; an expired row met during lookup is deleted.
- **Rationale**: Spec assumption (7 days, fixed). Deleting rows makes "invalidated sessions are not reusable" structurally true, without a revoked flag. No cleanup job (XII).
- **Alternatives**: `revokedAt` column (extra state to check everywhere); scheduled purge (extra moving part; stale rows are harmless).

### D-4 Cookie delivery

- **Decision**: `@fastify/cookie`. Cookie `sid`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `NODE_ENV=production`, `Expires` equal to session expiry. Clearing uses the same attributes.
- **Rationale**: Constitution V and `backend.md` cookie defaults; the plugin is the standard Fastify route and adds signed/parsed cookie support without hand-rolled header parsing.
- **Alternatives**: hand-parsing `Cookie` and writing `Set-Cookie` (fewer deps but more security-sensitive custom code).

### D-5 Local cross-origin setup

- **Decision**: Web on `localhost:3000`, API on `localhost:3001`. Ports do not change the "site", so a `SameSite=Lax` cookie is sent on credentialed requests. Enable CORS for the single configured `WEB_ORIGIN` with `credentials: true`; the web fetcher uses `credentials: 'include'`.
- **Rationale**: Matches `frontend.md` (browser requests include credentials; server-side requests forward cookies explicitly).
- **Alternatives**: Next.js rewrite proxy making everything same-origin (hides the API origin but couples dev to Next config and still needs cookie forwarding on the server side).

### D-6 Runtime validation

- **Decision**: Zod 4 schemas per endpoint plus one small `ZodValidationPipe` that throws a `400` carrying field-level errors. Unknown body keys are stripped (Zod default), so a client-sent `userId` never reaches a service.
- **Rationale**: Zod is the mandated library; one ~15-line pipe avoids another dependency.
- **Alternatives**: `nestjs-zod` (new dependency for little gain); `class-validator` (second validation system).

### D-7 Authentication enforcement

- **Decision**: A global `AuthGuard` registered as `APP_GUARD` that is default-deny; `@Public()` opts out for register, login and logout.
- **Rationale**: A forgotten decorator on a future route fails closed (401) instead of open. Costs one decorator and a `Reflector` check.
- **Alternatives**: Opt-in `@UseGuards(AuthGuard)` per controller (a later feature could silently ship an open route).

### D-8 Ownership enforcement and response parity

- **Decision**: All CV reads go through `CvService.findOwnedOrThrow(userId, cvId)` using `findFirst({ where: { id, userId } })`; `null` -> `404 CV_NOT_FOUND`.
- **Rationale**: Ownership is part of the query (`backend.md`), and not-found / not-owned are the same code path, so parity cannot drift. Future operations must reuse the same method (FR-031).
- **Alternatives**: Fetch by id then compare owners (two steps, easy to forget the comparison, can leak via differing responses); `403` for not-owned (reveals existence).

### D-9 Duplicate email and normalisation

- **Decision**: Normalise (trim, lower-case) before write and lookup so the existing unique index enforces case-insensitive uniqueness. Rely on the unique constraint for concurrency: catch Prisma `P2002` and return `409`.
- **Rationale**: Avoids a check-then-insert race (spec edge case). No extra column or functional index needed.
- **Alternatives**: `citext` extension (extra DB setup); a pre-check query (racy).

### D-10 Atomic registration

- **Decision**: One Prisma nested write creates the `User` and its first `Session`.
- **Rationale**: Spec edge case "no partial account or session left behind", with no explicit transaction code.

### D-11 Login equalisation

- **Decision**: Same `401 INVALID_CREDENTIALS` body for unknown email and wrong password. When the user does not exist, verify the supplied password against a precomputed dummy Argon2 hash so response time is similar.
- **Rationale**: FR-009 / SC-006. Timing equalisation is best effort and cheap; response equality is what tests assert.

### D-12 Error shape and logging

- **Decision**: A global exception filter returns `{ statusCode, code, message, fieldErrors? }` and handles only what this feature needs: `ApiError` (serialized as given), Fastify content-type/body-parsing errors (`400 VALIDATION_ERROR`; Nest's Fastify adapter turns them into a plain `HttpException` and drops Fastify's `FST_ERR_*` code, so they are matched as the exact base class with a 4xx status, which the app itself never throws), the unknown-route `404` (`NOT_FOUND`), and a fallback for anything else, which is logged with Nest `Logger` and returned as a generic `500 INTERNAL_ERROR`. Other `HttpException` subtypes are deliberately not mapped; a future feature adds explicit handling only if it needs it. Logs carry event category and user id only.
- **Rationale**: FR-034..FR-036 and `backend.md` (no stack traces, Prisma internals, secrets, session ids in output or logs).

### D-13 Configuration

- **Decision**: Validate env with a Zod schema through `ConfigModule.forRoot({ validate })`: `DATABASE_URL`, `NODE_ENV`, `PORT` (default 3001), `WEB_ORIGIN` (default `http://localhost:3000`).
- **Rationale**: `backend.md` asks for centralised, fail-fast config. Existing `PrismaService` is not touched.

### D-14 Frontend approach

- **Decision**: Server Components check the session by calling `/auth/me` server-side with the forwarded cookie and redirect on 401. Forms use React Hook Form + Zod and a small typed `apiFetch` wrapper over `fetch`. No TanStack Query and no shared workspace package in this feature.
- **Rationale**: `frontend.md` limits Query to cases with clear value (polling, mutations that invalidate caches); two submit-once forms do not need it. `packages/shared` has no package setup, so duplicating two small schemas is cheaper than wiring it.
- **Alternatives**: Query mutations for forms (extra provider and dependency for no behavior gain); Next middleware/proxy for route protection (a second place making auth decisions; the server-side check at the page is simpler and the API remains the authority).

### D-15 Test approach

- **Decision**: HTTP-level tests against a real PostgreSQL test database using Fastify `inject()` (no ports), with `configureApp()` shared with `main.ts`. Test DB `<name>_test` is created and migrated in a Vitest `globalSetup`. Isolation by unique emails per test rather than table truncation. Expiry is simulated by editing `Session.expiresAt` in the DB.
- **Rationale**: `testing.md` prefers app injection, realistic DB behavior for invariants (unique email, ownership queries) and observable-behavior assertions; mocking Prisma would hide exactly the bugs that matter here. Verified that Nest DI already works under the current Vitest config.
- **Alternatives**: Mocked Prisma (fast, but would not exercise unique constraints or ownership queries); supertest over a real port (extra moving parts); truncating tables between tests (order coupling, blocks parallel files).

### D-16 Tooling corrections required by the constitution

- Set `typescript/no-explicit-any` to `error` in `apps/api/.oxlintrc.json`.
- Add Prisma CLI scripts that pass `--config prisma7.config.ts`.
- Remove dead starter files and replace the starter e2e test with the feature's e2e tests.
