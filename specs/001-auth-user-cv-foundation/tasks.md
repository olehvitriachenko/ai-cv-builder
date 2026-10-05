---

description: "Task list for Authentication and User-Owned CV Foundation"
---

# Tasks: Authentication and User-Owned CV Foundation

**Input**: Design documents from `/specs/001-auth-user-cv-foundation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/auth-and-cv-api.md](./contracts/auth-and-cv-api.md), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED for all critical auth, session and ownership behavior (spec "Required Automated Test Coverage", constitution X). Within each story, write the tests first and confirm they fail before implementing (`.claude/rules/testing.md`). The one exception is T045, which is optional and cut-first.

**Organization**: Tasks are grouped by user story. Every task that touches `.ts`/`.tsx` must satisfy strict TypeScript: no `any`, no `@ts-ignore`, `unknown` plus Zod narrowing for untrusted input.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1..US6, mapping to the user stories in spec.md
- Paths are relative to the repository root. `API` = `apps/api`, `WEB` = `apps/web`.

## Approved decisions

1. Global default-deny auth guard; public routes opt out with `@Public()`.
2. Integration tests use real PostgreSQL and Fastify `inject()`; no mocks of our own code.
3. Dead Nest starter controller, service and e2e files are deleted.
4. Login and register forms stay simple (React Hook Form + Zod); no TanStack Query.
5. `@node-rs/argon2` is preferred; installing and importing it under ESM is a prerequisite (T001). Fall back to `argon2` if it fails.
6. (Analysis follow-up) Task list trimmed: redundant unit specs removed, the logging leak test is optional and cut-first, no "redirect if already signed in" on the auth pages, and Constitution XV (Docker Compose) is deferred to a project-level follow-up.
7. (Second analysis follow-up) Email normalisation lives in one shared Zod fragment; exact password boundaries are tested only in the schema specs; the exception filter handles only `ApiError`, body-parsing errors, unknown-route 404 and a safe 500 fallback (no test task for the 500 branch); malformed-JSON-before-401 is documented in the contract only.

## Adjustments to plan.md (file organization only)

- E2E tests are split per story: `smoke`, `register`, `login`, `session`, `logout`, `cv-ownership`, plus the optional `logging`. Protected-route coverage lives inside `session` (for `/auth/me`) and `cv-ownership` (for the CV routes); there is no separate protected-routes file.
- `common/http/api-error.ts` is added (one `ApiError` carrying status, `code`, message and optional `fieldErrors`).
- Form Zod schemas live next to their forms (no `lib/auth/schemas.ts`).
- Removed standalone specs: Zod pipe, exception filter and `PasswordService`. The exception filter handles only `ApiError`, body-parsing errors, unknown-route 404 and a safe 500 fallback. Their behavior is exercised by the register invalid-input table, the smoke test (404 shape) and the register/login e2e tests (Argon2id at rest, valid and invalid credentials).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, scripts and lint config the rest of the work relies on.

- [x] T001 In `apps/api`, run `pnpm add @node-rs/argon2` and prove it works under ESM on this machine: hash and verify a string from a throwaway script and from a throwaway Vitest spec (delete both afterwards). If install or import fails, run `pnpm remove @node-rs/argon2`, `pnpm add argon2`, add `argon2: true` under `allowBuilds` in `pnpm-workspace.yaml`, and re-verify. Record the final choice and any fallback reason under D-1 in `specs/001-auth-user-cv-foundation/research.md`. Later tasks say "the chosen Argon2 package".
- [x] T002 In `apps/api`, run `pnpm add @fastify/cookie`, and add the Prisma scripts to `apps/api/package.json`: `prisma:generate`, `prisma:migrate:dev`, `prisma:migrate:deploy`, each calling `prisma <command> --config prisma7.config.ts` (the config file is not named `prisma.config.ts`, so the CLI would not find it otherwise). Depends on T001 (shared `package.json` and lockfile).
- [x] T003 [P] Change `typescript/no-explicit-any` from `"off"` to `"error"` in `apps/api/.oxlintrc.json` (constitution II); run `pnpm --filter api lint` and fix any violations in code that remains after T004
- [x] T004 [P] Delete the dead Nest starter files: `apps/api/src/app.controller.ts`, `apps/api/src/app.service.ts`, `apps/api/src/app.controller.spec.ts` and `apps/api/test/app.e2e-spec.ts` (none is registered in `AppModule`; the e2e test asserts the starter `Hello World!` route). Commit this on its own. Note: `vitest run` fails with "no test files" until the first spec lands in T011; that is expected.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema change, HTTP boundary helpers, app wiring, test harness and pure session/password/cookie helpers that every user story needs.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 **Prerequisite**: from the repository root run `docker compose up -d postgres` and confirm the database accepts connections. Then, in `apps/api/prisma/schema.prisma`, change `Cv.targetRole` from `String` to `String?` (data-model: "`targetRole` | string, nullable (changed) | Optional; when provided: trimmed, non-blank, at most 200 characters"). Run `pnpm --filter api prisma:migrate:dev --name cv_target_role_optional` to create `apps/api/prisma/migrations/<timestamp>_cv_target_role_optional/migration.sql` (expected: a single `ALTER COLUMN "targetRole" DROP NOT NULL`), then `pnpm --filter api prisma:generate` (the generated client under `apps/api/src/generated/prisma` is gitignored, so a fresh clone must generate it). No other schema change. Depends on T002.
- [x] T006 [P] Create `apps/api/src/config/env.ts`: a Zod schema validating `DATABASE_URL` (non-empty string), `NODE_ENV` (`development` | `test` | `production`, default `development`), `PORT` (coerced number, default 3001) and `WEB_ORIGIN` (URL, default `http://localhost:3000`), exporting the `Env` type and a `validateEnv(raw: Record<string, unknown>)` function that throws on invalid values. Wire it into `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })` in `apps/api/src/app.module.ts`. Create `apps/api/.env.example` listing the four variables with placeholder values (no secrets).
- [x] T007 [P] Create `apps/api/src/common/http/api-error.ts` (`ApiError extends HttpException` with `statusCode`, `code`, `message`, optional `fieldErrors: Record<string, string[]>`) and `apps/api/src/common/http/zod-validation.pipe.ts` (`ZodValidationPipe<T>(schema)`: `safeParse` the incoming `unknown`; on failure throw `ApiError(400, 'VALIDATION_ERROR', 'Invalid request', fieldErrors)` built with Zod 4 `z.flattenError`; on success return the parsed value so unknown keys are stripped). No standalone spec: this behavior is covered by the register invalid-input table (T015).
- [x] T008 Create `apps/api/src/common/http/api-exception.filter.ts`: a global filter returning `{ statusCode, code, message, fieldErrors? }` per the contract. It explicitly handles only four cases and is not a generic mapper for Nest `HttpException` subtypes: (1) `ApiError`, serialized as given; (2) Fastify content-type/body-parsing errors (such as malformed JSON or an empty JSON body), returned as `400 VALIDATION_ERROR` with message "Invalid request body". Nest's Fastify adapter converts these into a plain `HttpException(message, statusCode)` and drops the `FST_ERR_*` code, so they are recognised as the exact base `HttpException` class with a 4xx status (the app itself throws `ApiError`, and `NotFoundException` is a subclass, so neither matches); (3) the unknown-route `NotFoundException`, returned as `404 NOT_FOUND`; (4) everything else, including any other `HttpException`, is treated as unexpected: logged with Nest `Logger` (message and error class only, never request headers or body) and returned as `500 INTERNAL_ERROR` with a generic message. Never output stack traces, Prisma errors, hashes or tokens. No standalone spec and no dedicated test for the 500 branch: cases (1) to (3) are covered by the smoke test (T010) and the e2e error-shape assertions. Depends on T007.
- [x] T009 Create `apps/api/src/app.setup.ts` exporting `configureApp(app: NestFastifyApplication)`: set the global prefix `api`, register `@fastify/cookie`, call `enableCors({ origin: <WEB_ORIGIN from ConfigService>, credentials: true })`, and `useGlobalFilters(new ApiExceptionFilter())`. Change `apps/api/src/main.ts` to call `configureApp(app)` and listen on the validated `PORT`. Depends on T002, T006, T008.
- [x] T010 Create the test harness under `apps/api/test/`: `helpers/test-db.ts` (derive `<database>_test` URL from `DATABASE_URL`, loading `apps/api/.env` with Node's built-in `process.loadEnvFile`), `global-setup.ts` (create the test database if missing via `pg` on the `postgres` database, then run `prisma migrate deploy --config prisma7.config.ts` against it), `setup-env.ts` (set `process.env.DATABASE_URL` to the test URL and `NODE_ENV='test'` before any app import), `helpers/create-test-app.ts` (`Test.createTestingModule({ imports: [AppModule] })`, create a `NestFastifyApplication`, call `configureApp`, `init()` and `getHttpAdapter().getInstance().ready()`), `helpers/cookies.ts` (parse `set-cookie` header values into name, value and attributes) and `helpers/users.ts`, which provides a unique random email, a valid password, and the shared setup helpers **`registerUser(app, overrides?)`** (calls `POST /api/auth/register`, returns `{ email, password, user, cookie, response }`) and **`loginUser(app, { email, password })`** (calls `POST /api/auth/login`, returns `{ cookie, response }`). Story test files must use these helpers for account and session setup instead of hand-rolling requests (the helpers are first exercised in T015 and T020). Update `apps/api/vitest.config.e2e.ts` with `globalSetup` and `setupFiles`. Add `apps/api/test/smoke.e2e-spec.ts`: the app boots and `GET /api/does-not-exist` returns `404` with the standard error shape (unknown routes are 404, not 401, because the guard only runs on matched routes). Tests isolate data with unique emails; they do not truncate tables. Depends on T005, T009.
- [x] T011 [P] Create `apps/api/src/modules/auth/session-token.ts` (pure functions `generateSessionToken()`: 32 bytes from `crypto.randomBytes`, base64url; and `hashSessionToken(token)`: `sha256` hex) with `apps/api/src/modules/auth/session-token.spec.ts` asserting: token is 43 URL-safe characters, two tokens differ, hash is 64 hex characters, deterministic, and never equals the token
- [x] T012 [P] Create `apps/api/src/modules/auth/password.service.ts` using the Argon2 package chosen in T001 (Argon2id, library defaults): `hash(password)`, `verify(hash, password)` returning `boolean`, and `verifyDummy(password)` which verifies against a dummy hash **computed once in `onModuleInit`** (not lazily on the first failed login), so unknown-email logins cost about the same as real ones from the very first request. No standalone spec: Argon2id at rest is asserted in T015 and credential checks in T025. Depends on T001.
- [x] T013 [P] Create `apps/api/src/modules/auth/session-cookie.ts` with: `SESSION_COOKIE_NAME = 'sid'`; a pure `buildSessionCookieOptions(expiresAt: Date, secure: boolean)` returning the cookie attributes (`httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `expires`, and `secure`); `setSessionCookie(reply, token, expiresAt, secure)` and `clearSessionCookie(reply, secure)` (same options, already expired) built on it; and `readSessionCookie(request): string | undefined` (treat the value as an untrusted string). **Source of `secure`**: it comes from validated application config, `secure = NODE_ENV === 'production'` read through `ConfigService`, never from inline `process.env`; callers (T019, T026, T028) read it once and pass it in. Add one small `apps/api/src/modules/auth/session-cookie.spec.ts` with two focused cases on `buildSessionCookieOptions`: `secure=true` (production) yields `secure: true`, and `secure=false` (non-production) yields `secure` not set; both always have `httpOnly: true`, `sameSite: 'lax'` and `path: '/'`. Do not build a larger cookie suite. Depends on T002.

**Checkpoint**: Foundation ready. `pnpm --filter api test` and `pnpm --filter api test:e2e` run green, and the app boots with the standard error shape.

---

## Phase 3: User Story 1 - Register an account (Priority: P1) 🎯 MVP

**Goal**: A visitor registers with email and password, is signed in automatically (FR-004), and duplicates and invalid input fail cleanly.

**Independent Test**: `POST /api/auth/register` with a new email returns `201` plus an HTTP-only `sid` cookie; repeating it returns `409`; invalid input returns `400` with field errors; the stored password hash is Argon2id.

### Tests for User Story 1 (write first; confirm they fail)

- [x] T014 [P] [US1] Create `apps/api/src/modules/auth/auth.schemas.spec.ts` for `registerSchema`. This file is the single home for the exact boundary cases: email is trimmed and lower-cased (through the shared `normalizedEmail` fragment); invalid email rejected; email longer than 254 characters rejected; password of 7 characters rejected, 8 accepted, 128 accepted, 129 rejected; password whitespace is not trimmed; an extra `userId` key is stripped from the output
- [x] T015 [P] [US1] Create `apps/api/test/register.e2e-spec.ts`: (a) success returns `201 { id, email }` with no password or hash fields and a `sid` cookie that is `HttpOnly`, `SameSite=Lax`, `Path=/`, has `Expires` about 7 days ahead and no `Secure` outside production; (b) the database holds a `Session` whose `tokenHash` differs from the cookie value and a `User.passwordHash` that starts with `$argon2id$` and is not the password; (c) duplicate email, including different case and surrounding whitespace, returns `409 EMAIL_ALREADY_REGISTERED`, sets no cookie and creates no second user; (d) two simultaneous registrations of one new email give exactly one `201` and one `409`; (e) a short table of representative invalid bodies (a bad email, a clearly too-short password, missing fields, wrong types, an empty body, malformed JSON), each returning `400 VALIDATION_ERROR` with `fieldErrors` where applicable and creating no user. This proves the HTTP boundary, the Zod pipe and the exception filter; exact length boundaries (7/8/128/129, 254) are covered only in T014 and are not repeated here; (f) a `userId` in the body is ignored

### Implementation for User Story 1

- [x] T016 [US1] Create `apps/api/src/modules/auth/auth.schemas.ts`. First define and export one shared Zod fragment, `normalizedEmail` (`z.string()` with trim and lower-case), as the only place email normalisation happens; both `registerSchema` and `loginSchema` (T026) must build on it, with no duplicated trim/lower-case logic and no generic validation utility package. Then add `registerSchema` and its inferred type. Email: `normalizedEmail`, valid address, at most 254 characters. Password: 8 to 128 characters, not trimmed. Unknown keys stripped. Depends on T014.
- [x] T017 [US1] Create `apps/api/src/modules/auth/session.service.ts` with the 7-day lifetime constant ("`createdAt + 7 days`, fixed (no renewal)") and `issue()`, a pure method returning `{ token, tokenHash, expiresAt }` built from `session-token.ts` ("`sha256(rawToken)` hex. The raw token is never stored"). Depends on T011.
- [x] T018 [US1] Create `apps/api/src/modules/auth/auth.service.ts` with `register(input)`: hash the password with `PasswordService`, call `SessionService.issue()`, then one nested `prisma.user.create` that also creates the first `Session`, so no account exists without a session and nothing is left half-written. Email is stored as already normalised (trimmed, lower-cased). Catch Prisma `P2002` on the email unique constraint and throw `ApiError(409, 'EMAIL_ALREADY_REGISTERED', ...)`. Return `{ user: { id, email }, token, expiresAt }`. Log event category `auth.register` and the user id only. Depends on T012, T016, T017.
- [x] T019 [US1] Create `apps/api/src/modules/auth/public.decorator.ts` (`@Public()` sets a metadata key via `SetMetadata`; export the key for the guard) and `apps/api/src/modules/auth/auth.controller.ts` (thin) with `POST /auth/register`, marked `@Public()`, body through `ZodValidationPipe(registerSchema)`, responding `201 { id, email }`. The controller reads `NODE_ENV` from `ConfigService` once (`secure = NODE_ENV === 'production'`) and passes it to `setSessionCookie`. Create `apps/api/src/modules/auth/auth.module.ts` providing the controller, `AuthService`, `SessionService` and `PasswordService`, and import `AuthModule` in `apps/api/src/app.module.ts`. Depends on T013, T018.

**Checkpoint**: User Story 1 works end to end and `register.e2e-spec.ts` passes.

---

## Phase 4: User Story 4 - Protected resources reject unauthenticated access (Priority: P1)

**Goal**: Every route is protected by default; a missing, malformed, unknown, expired or invalidated session always yields the same `401`. Delivers `GET /auth/me`, which also provides reload persistence.

**Independent Test**: `GET /api/auth/me` returns `200 { id, email }` with a valid cookie and an identical `401 UNAUTHENTICATED` for every kind of bad session.

*Phase order note: this story is built before User Story 2 because the login and logout tests use `/auth/me` and the guard.*

### Tests for User Story 4 (write first; confirm they fail)

- [x] T020 [US4] Create `apps/api/test/session.e2e-spec.ts` (use `registerUser` from T010): (a) after registering, `GET /api/auth/me` with the cookie returns `200` with exactly `{ id, email }` (this is the reload-persistence check: a fresh request carrying only the cookie is recognised); (b) no cookie, a malformed cookie value, and a well-formed but unknown token each return `401 UNAUTHENTICATED`; (c) after moving `Session.expiresAt` into the past in the database, the request returns `401` and the expired row is deleted; (d) deleting the user cascades the session and the cookie then returns `401`; (e) all of these `401` responses have identical status and body; (f) a client-sent `userId` in query, body or header never changes who `me` returns. This file is the protected-route coverage for `/auth/me`; the CV routes get the same treatment in T031.

### Implementation for User Story 4

- [x] T021 [US4] Add `SessionService.validate(rawToken: string)` to `apps/api/src/modules/auth/session.service.ts`: hash the token, find the `Session` by unique `tokenHash` including the user's `id` and `email`; if absent return `null`; if `expiresAt <= now` delete the row and return `null`; otherwise return the `AuthUser`. Create `apps/api/src/modules/auth/auth.types.ts` with `AuthUser = { id: string; email: string }` and the `FastifyRequest` module augmentation adding an optional `authUser`. Depends on T017.
- [x] T022 [US4] Create `apps/api/src/modules/auth/auth.guard.ts`: `CanActivate` that returns `true` when the handler or class carries `@Public()` (via `Reflector`); otherwise reads the cookie with `readSessionCookie`, calls `SessionService.validate`, attaches the user to the request, or throws `ApiError(401, 'UNAUTHENTICATED', 'Authentication required')` with one fixed message for every cause. Create `apps/api/src/modules/auth/current-user.decorator.ts` (`@CurrentUser()` reads `request.authUser`, throwing `ApiError(401, 'UNAUTHENTICATED', ...)` if absent). Register the guard in `AuthModule` with `{ provide: APP_GUARD, useClass: AuthGuard }`. Depends on T019, T021.
- [x] T023 [US4] Add `GET /auth/me` to `apps/api/src/modules/auth/auth.controller.ts` (not public) returning `{ id, email }` from `@CurrentUser()`. Depends on T022.

**Checkpoint**: Default-deny is in force and `session.e2e-spec.ts` passes; register still works because it is `@Public()`.

---

## Phase 5: User Story 2 - Sign in and stay signed in (Priority: P1)

**Goal**: A registered user signs in with email and password; failures never reveal whether the email or the password was wrong.

**Independent Test**: `POST /api/auth/login` with correct credentials returns `200 { id, email }` and a `sid` cookie that `GET /api/auth/me` accepts; wrong password and unknown email return byte-identical `401 INVALID_CREDENTIALS` responses.

### Tests for User Story 2 (write first; confirm they fail)

- [x] T024 [P] [US2] Extend `apps/api/src/modules/auth/auth.schemas.spec.ts` with `loginSchema` cases: email trimmed and lower-cased (same `normalizedEmail` behavior as registration, asserted with one case rather than re-testing every rule), non-empty, at most 254 characters, format not enforced; password 1 to 128 characters; empty or missing values rejected; extra keys stripped
- [x] T025 [P] [US2] Create `apps/api/test/login.e2e-spec.ts` (use `registerUser` and `loginUser` from T010): (a) correct credentials return `200 { id, email }` with the same cookie attributes as registration, and the cookie works on `/api/auth/me`; (b) wrong password and unknown email each return `401 INVALID_CREDENTIALS` with the same status, body and headers, and no cookie; (c) an email with different case or surrounding whitespace logs in; (d) a malformed-format email returns the same `401` (not `400`); (e) missing fields, wrong types and an empty password return `400 VALIDATION_ERROR`; (f) a second login creates a second session and the first cookie still works; (g) the `Session.tokenHash` stored for each login differs from its cookie value

### Implementation for User Story 2

- [x] T026 [US2] Implement login in one task, touching `apps/api/src/modules/auth/auth.schemas.ts`, `session.service.ts` and `auth.service.ts`: (1) add `loginSchema` built on the shared `normalizedEmail` fragment from T016 (email: normalised, non-empty, at most 254 characters, format not enforced; password: 1 to 128 characters; unknown keys stripped); (2) add `SessionService.create(userId)`, which uses `issue()` and persists a `Session` row, returning `{ token, expiresAt }`; (3) add `AuthService.login(input)`: look up the user by normalised email; when absent call `PasswordService.verifyDummy`, otherwise `verify`; any failure throws the same `ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')`; on success call `SessionService.create` and return the user plus token and expiry. Log `auth.login` with the user id on success and `auth.login.failed` with no email, password or other identifying input on failure. Depends on T012, T017, T024.
- [x] T027 [US2] Add `POST /auth/login` to `apps/api/src/modules/auth/auth.controller.ts`: `@Public()`, `@HttpCode(200)`, body through `ZodValidationPipe(loginSchema)`, set the cookie with the same `secure` value as T019, respond `{ id, email }`. Depends on T026.

**Checkpoint**: Users can register, sign in and call `/auth/me`; `login.e2e-spec.ts` passes.

---

## Phase 6: User Story 3 - Sign out (Priority: P1)

**Goal**: Logout ends only the current session immediately and permanently, and always clears the cookie.

**Independent Test**: Capture the cookie, call `POST /api/auth/logout` (expect `204` and a clearing `Set-Cookie`), then replay the captured cookie against `/api/auth/me` (expect `401`).

### Tests for User Story 3 (write first; confirm they fail)

- [x] T028 [US3] Create `apps/api/test/logout.e2e-spec.ts` (use `registerUser` and `loginUser` from T010): (a) logout with a valid cookie returns `204`, `Set-Cookie` clears `sid` (expired, `Path=/`, `HttpOnly`) and the `Session` row is gone; (b) the replayed old cookie now returns `401 UNAUTHENTICATED` on `/api/auth/me`; (c) with two sessions for one user, logging one out leaves the other valid; (d) logout with no cookie and with a garbage cookie each return `204` and still clear the cookie; (e) logging out twice is harmless

### Implementation for User Story 3

- [x] T029 [US3] Implement logout in one task, touching `apps/api/src/modules/auth/session.service.ts`, `auth.service.ts` and `auth.controller.ts`: (1) add `SessionService.revoke(rawToken: string)` using `deleteMany` by hashed token so it never throws when the row does not exist; (2) add `AuthService.logout(token: string | undefined)`: revoke when a token is present, log `auth.logout` with no token value; (3) add `POST /auth/logout`: `@Public()`, `@HttpCode(204)`, read the cookie with `readSessionCookie`, call `AuthService.logout`, always `clearSessionCookie` with the same `secure` value as T019. Depends on T017, T027 (same controller file).

**Checkpoint**: Full authentication lifecycle works; `logout.e2e-spec.ts` passes.

---

## Phase 7: User Story 5 - Own CVs and only own CVs (Priority: P1)

**Goal**: A signed-in user creates a minimal CV they own and reads it back; nobody else can, and the response for a CV that is not theirs is identical to the response for one that does not exist.

**Independent Test**: User A creates a CV and reads it (`200`); User B requests A's CV id and a non-existent id and receives identical `404 CV_NOT_FOUND` responses; a `userId` supplied anywhere changes nothing.

### Tests for User Story 5 (write first; confirm they fail)

- [x] T030 [P] [US5] Create `apps/api/src/modules/cv/cv.schemas.spec.ts`: `createCvSchema` accepts a missing `targetRole`; trims it; rejects a blank or whitespace-only value; accepts 200 characters and rejects 201; rejects non-strings; strips an extra `userId`. `cvIdSchema` accepts a Prisma `cuid()` value and rejects `not-an-id` and empty strings
- [x] T031 [P] [US5] Create `apps/api/test/cv-ownership.e2e-spec.ts` with two users A and B created through `registerUser`: (a) A creates a CV: `201 { id, targetRole, createdAt, updatedAt }` with no `userId` in the body, and the database row's owner is A; (b) creating with no `targetRole` stores `null`; a blank `targetRole` returns `400`; (c) A reads own CV: `200`; (d) B reads A's CV and then a non-existent but well-formed id: `404 CV_NOT_FOUND` with byte-identical status and body; (e) `userId` in the create body is ignored and the owner is still the session user; `?userId=<A id>` and an `x-user-id: <A id>` header sent by B do not grant access; `?userId=<B id>` sent by A does not hide A's own CV; (f) a malformed id returns `400 VALIDATION_ERROR`; (g) **protected-route coverage for the CV routes**: for each bad-session kind (no cookie, garbage cookie, expired session, signed-out session via the logout endpoint), both `POST /api/cvs` and `GET /api/cvs/:id` return the identical `401 UNAUTHENTICATED` (SC-002, AC-007). Send valid JSON bodies in this matrix: malformed-JSON requests are deliberately excluded because the body is parsed before the guard (documented in the contract) and there is no dedicated test for that behavior; (h) an id produced by Prisma's `cuid()` passes `cvIdSchema` (guards against a Zod/Prisma id-format mismatch)

### Implementation for User Story 5

- [x] T032 [US5] Create `apps/api/src/modules/cv/cv.schemas.ts` and `apps/api/src/modules/cv/cv.service.ts`. Schemas: `createCvSchema` with `targetRole` optional ("Optional; when provided: trimmed, non-blank, at most 200 characters") and unknown keys stripped; `cvIdSchema` validating the Prisma id format (Zod `cuid`; adjust only if T031(h) shows a mismatch). Service: `create(userId, input)` writes `userId` from its argument only; `findOwnedOrThrow(userId, cvId)` runs `prisma.cv.findFirst({ where: { id: cvId, userId } })` and throws `ApiError(404, 'CV_NOT_FOUND', 'CV not found')` for `null`, so "not found" and "not owned" share one code path; `getOwned(userId, cvId)` calls it and maps to `{ id, targetRole, createdAt, updatedAt }` with no `userId`. Add a short comment on `findOwnedOrThrow` stating that all future read, update, delete, generate, clarification and export operations must go through it (FR-031). Depends on T030.
- [x] T033 [US5] Create `apps/api/src/modules/cv/cv.controller.ts` (thin): `POST /cvs` (`ZodValidationPipe(createCvSchema)`, `@CurrentUser()`, `201`) and `GET /cvs/:id` (`ZodValidationPipe(cvIdSchema)` on the param, `@CurrentUser()`). Controllers must never read `userId` from body, query, route or headers. Create `apps/api/src/modules/cv/cv.module.ts` and import it in `apps/api/src/app.module.ts`. Depends on T022, T032.

**Checkpoint**: All API behavior from the spec is in place; `cv-ownership.e2e-spec.ts` passes.

---

## Phase 8: User Story 6 - Simple, mobile-friendly sign-up and sign-in screens (Priority: P2)

**Goal**: Register, sign-in and a minimal signed-in page that work at 320 px, show clear non-sensitive errors, and persist across reload using the server-side session.

**Independent Test**: Follow quickstart section 3 at phone width: register, reload, sign out, sign in, and trigger validation, duplicate-email and wrong-credentials messages.

- [x] T034 [US6] In `apps/web`: first read the relevant guides in `apps/web/node_modules/next/dist/docs/` for `cookies()`, `redirect()`, Server vs Client Components, forms and route conventions (`apps/web/AGENTS.md` says this Next.js version has breaking changes), noting any API that differs from older Next.js in a short comment where it is used; then run `pnpm add react-hook-form zod @hookform/resolvers` (no TanStack Query, per decision 4)
- [x] T035 [P] [US6] Create `apps/web/src/lib/api/fetcher.ts`: `apiFetch<TResponse, TBody = undefined>(path, options)` over native `fetch`; base URL from `NEXT_PUBLIC_API_URL` (default `http://localhost:3001/api`); `credentials: 'include'`; supports GET, POST, PATCH, PUT, DELETE with a typed JSON body; handles `204` without parsing; optional Zod `schema` for runtime response validation; non-2xx responses throw a typed `ApiError` (status, `code`, message, optional `fieldErrors`) parsed from the contract's error body; **a thrown `fetch` failure (network down, server unreachable) is caught and normalised into the same `ApiError` type** (for example `status: 0`, `code: 'NETWORK_ERROR'`, generic message) so callers handle one error type; an optional `cookie` header option for server-side calls. No `any`, no unsafe casts. Depends on T034.
- [x] T036 [P] [US6] Create `apps/web/src/components/ui/button.tsx` and `apps/web/src/components/ui/text-field.tsx` (real `<button>` and `<input>`; a visible `<label>`; inline error text linked with `aria-describedby` and `aria-invalid`; visible focus ring; mobile-first Tailwind classes; errors never rely on colour alone)
- [x] T037 [US6] Create `apps/web/src/lib/api/auth.ts` (`register`, `login`, `logout` built on `apiFetch`, returning a `{ id, email }` user type validated with Zod) and `apps/web/src/lib/auth/server.ts` (`getCurrentUser()`: server-only; reads the incoming `cookie` header with `next/headers`, forwards it to `GET /auth/me`, returns the user or `null` on `401`). Depends on T035.
- [x] T038 [P] [US6] Create `apps/web/src/app/register/page.tsx` (plain Server Component rendering the form; no redirect when already signed in) and `apps/web/src/app/register/register-form.tsx` (Client Component: React Hook Form with `zodResolver` and a Zod schema defined in this file: email valid, at most 254 characters; password 8 to 128 characters; the server stays authoritative). On success `router.replace('/')` then `router.refresh()`; a `400` maps `fieldErrors` onto fields; a `409` shows "An account with this email is already registered."; any other error, including the network `ApiError`, shows a generic failure message with no technical detail; the submit button is disabled while pending; link to `/login`. Depends on T036, T037.
- [x] T039 [P] [US6] Create `apps/web/src/app/login/page.tsx` (plain Server Component rendering the form; no redirect when already signed in) and `apps/web/src/app/login/login-form.tsx` (same pattern as the register form, with a Zod schema defined in this file: email non-empty, password non-empty). Any `401` shows the single message "Invalid email or password."; any other error shows the generic failure message; link to `/register`. Depends on T036, T037.
- [x] T040 [P] [US6] Replace the create-next-app boilerplate in `apps/web/src/app/page.tsx` with the minimal signed-in view: Server Component that calls `getCurrentUser()`, `redirect('/login')` when `null`, otherwise shows the user's email and a sign-out control. Create `apps/web/src/components/sign-out-button.tsx` (Client Component: call `logout`, then `router.replace('/login')` and `router.refresh()`). Depends on T036, T037.
- [x] T041 [US6] Verify the web app: `pnpm --filter web lint`, `pnpm --filter web exec tsc --noEmit` and `pnpm --filter web build` all pass. Then walk quickstart section 3 at 320 px and 390 px width (no horizontal scroll, clear errors, reload keeps you signed in, nothing in Local/Session Storage, `sid` is HttpOnly). Depends on T038, T039, T040.

**Checkpoint**: The full feature is usable from the browser.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final quality gates, the logging-hygiene review, and the documentation of known trade-offs and project-level follow-ups.

- [x] T042 Run every quality gate for the API and fix failures instead of bypassing them: `pnpm --filter api test`, `pnpm --filter api test:e2e`, `pnpm --filter api exec tsc --noEmit`, `pnpm --filter api lint`, `pnpm --filter api build` (confirm `node dist/main` starts with the chosen Argon2 package under ESM). Run `grep -rnE "\bany\b|@ts-ignore" apps/api/src apps/api/test apps/web/src` and justify or remove any hit. **Logging review** (the required replacement for the optional T045): grep every `Logger` and `logger.` call in `apps/api/src` and confirm none logs a password, cookie, token, token hash, password hash, email or request body. Depends on T033, T041.
- [x] T043 Walk `specs/001-auth-user-cv-foundation/quickstart.md` sections 2, 4 and 5 against a running API and record any mismatch with the contract. Depends on T042.
- [x] T044 Final review and documentation: review the full diff against the spec (tick AC-001 through AC-012 and SC-001 through SC-009; check constitution V, X and XIV; confirm nothing outside this feature changed except the T004 starter-file deletion). Confirm the known trade-offs are still recorded in `specs/001-auth-user-cv-foundation/spec.md` (Assumptions: duplicate-email enumeration, CSRF reliance on the SameSite cookie; FR-012: no failed-login throttling). Then add a short **"Project-level follow-ups before final delivery"** list at the end of `specs/001-auth-user-cv-foundation/plan.md` stating that (1) the project README (constitution XVI) must repeat those trade-offs as production follow-ups, and (2) full-stack `docker compose up` for the API and web apps (constitution XV, deferred in this feature; the compose file currently provides only PostgreSQL) must be completed before final delivery. Do not amend the constitution. Depends on T042, T043.
- [x] T045 [P] **OPTIONAL, cut-first (skip if time is short; T042's logging review is the required fallback).** Create `apps/api/test/logging.e2e-spec.ts`: capture Nest `Logger` output while a user registers, logs in with a wrong then a correct password, calls `me` and logs out; assert the captured output never contains the password, the cookie or raw token value, the token hash, or the password hash (SC-008, FR-036). Depends on T029.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: starts immediately. T002 follows T001 (shared `package.json` and lockfile); T003 and T004 can run alongside T002.
- **Foundational (Phase 2)**: depends on Phase 1. Blocks every user story. T005 needs the database running (`docker compose up -d postgres`).
- **User stories**: depend on Phase 2. Execution order: US1 -> US4 -> US2 -> US3 -> US5 -> US6 (spec numbering differs from build order; see the note in Phase 4). US6 can start in parallel with US2/US3/US5 once the API contract for register, login, logout and `me` is stable (after T029).
- **Polish (Phase 9)**: depends on all stories. T045 is optional and independent after T029.

### User story dependencies

- **US1 Register**: needs Phase 2 only.
- **US4 Guard and `me`**: needs US1 (a cookie to test with) and `SessionService` (T017).
- **US2 Login**: needs US4 for the `me` assertions; otherwise independent.
- **US3 Logout**: needs US4 for replay assertions.
- **US5 CV**: needs US4 (the guard and `@CurrentUser()`) and US3 (the signed-out session kind in T031(g)).
- **US6 UI**: needs the API stories complete (calls register, login, logout, `me`).

### Within each story

1. Tests first and failing.
2. Schemas, then services, then controller wiring.
3. Run that story's e2e file to green before moving on.

### Parallel opportunities

- Setup: T003 and T004.
- Foundational: T006, T007, T011, T012 and T013 touch separate files and can run together after their listed dependencies.
- US1: T014 and T015 (tests) together.
- US2: T024 and T025 together.
- US5: T030 and T031 together.
- US6: T035 and T036 together after T034; T038, T039 and T040 together after T036 and T037.
- Two developers: one takes the API stories, the other starts US6 at T034 once the contract is stable.

### Parallel example: Foundational helpers

```text
T006 apps/api/src/config/env.ts
T007 apps/api/src/common/http/{api-error,zod-validation.pipe}.ts
T011 apps/api/src/modules/auth/session-token.ts
T012 apps/api/src/modules/auth/password.service.ts
T013 apps/api/src/modules/auth/session-cookie.ts
```

---

## Implementation Strategy

### MVP first

The smallest demonstrable slice is Phases 1 to 3 (register with auto sign-in). The smallest useful *product* slice for the next features is Phases 1 to 7: the complete authenticated, ownership-enforcing API, testable end to end with `curl` and the e2e suite. The UI (Phase 8) is last because it adds no new rules.

### Incremental delivery

1. Setup + Foundational: harness green, standard error shape.
2. US1: accounts exist and sign in on registration.
3. US4: default-deny in force, `me` works.
4. US2 and US3: full session lifecycle.
5. US5: ownership foundation that all later CV features reuse.
6. US6: screens.
7. Polish: quality gates, logging review, documentation of follow-ups.

### Scope guard

Do not add: listing, updating or deleting CVs, login throttling, extra CSRF hardening, password or email changes, "sign out everywhere", "redirect if already signed in" on the auth pages, web component tests, a shared workspace package, or TanStack Query. If a task seems to need one of these, stop and raise it instead.

---

## Notes

- Tick a task only after its tests pass and `tsc` is clean for the touched package.
- Commit after each story checkpoint; keep T004 (deleting starter files) in its own commit.
- Constraint wording in tasks is copied from `data-model.md`; if the two ever disagree, `data-model.md` and `spec.md` win.
