# AI CV Builder

A take-home implementation: email/password accounts, owned CVs, Anthropic generation from text or a selectable-text PDF, clarification answers, manual editing, and A4 PDF export.

## Run with Docker

Prerequisite: Docker Desktop (or Docker Engine with Compose). Internet access is needed for the first image build and Anthropic calls. No host Node.js or database installation is required.

```sh
cp .env.example .env
# Set ANTHROPIC_API_KEY in .env using your editor.
docker compose up --build
```

Open **http://localhost:3000**, sign up, and create a CV. Subsequent starts also work with `docker compose up`. PostgreSQL, migrations, API, and web start automatically. The only required external secret is `ANTHROPIC_API_KEY`; database credentials are local development defaults. Without a key the app still starts, but generation fails with `PROVIDER_NOT_CONFIGURED`. The default model is `claude-sonnet-5-5`; `ANTHROPIC_MODEL` can override it.

The API is at http://localhost:3001/api. Browser requests use the web's same-origin `/api` proxy; server rendering uses the internal API address. PostgreSQL data survives restarts in a named volume. API startup runs `prisma migrate deploy`: it applies checked-in migrations and stops if a migration fails, without resetting data or generating migrations.

If ports are occupied, set `WEB_PORT`, `API_PORT`, and/or `POSTGRES_PORT` before starting Compose (defaults 3000/3001/5432). Local Compose uses HTTP and non-Secure cookies; an internet deployment requires HTTPS, `NODE_ENV=production`, secure database credentials and suitable origins. This configuration is for local evaluation.

```sh
docker compose down       # stop; retain data
# docker compose down -v  # destructive: delete local database volume
```

## Local development

Prerequisites: Node.js 24, pnpm 11, Docker for PostgreSQL.

```sh
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
# Set ANTHROPIC_API_KEY in apps/api/.env.
pnpm db:up
pnpm db:migrate
pnpm dev
```

Web: http://localhost:3000. API: http://localhost:3001/api. The API's `.env` contains local database and origin defaults. Prisma generation runs before API development, typecheck, lint, tests and build, so the generated client need not be committed. Root `.env` is for Compose; `apps/api/.env` is for host development and smoke tests. Keep both out of Git.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

None of the automated tests call the real AI: the API unit tests and the web tests need neither the database nor a key; the API e2e tests need PostgreSQL but no key. API e2e tests use a separate database named `<DATABASE_URL database>_test`, apply migrations, remove the Anthropic key and substitute fake providers. PostgreSQL must be running; the configured local database user needs permission to create that test database. There is no separate automated web browser e2e suite; browser acceptance covers the integrated flow.

Optional real provider checks (incur Anthropic usage):

```sh
pnpm --filter api test:smoke
```

Smoke setup loads `apps/api/.env` automatically. Smoke tests are isolated from unit/e2e runs and require a real key. Never print the key or commit `.env` files.

## Architecture and lifecycle

- `apps/web`: Next.js App Router, React Hook Form, React Query, Zod; server-side authenticated loading and client-side editing/polling.
- `apps/api`: NestJS/Fastify REST API, Prisma/PostgreSQL, isolated Anthropic adapters, PDF ingestion/export.
- `packages/skill-catalogue`: shared skill data. PostgreSQL owns accounts, hashed sessions, CV source/draft/revision and clarification records.

A CV row is the durable generation job: `PENDING → PROCESSING → COMPLETED | FAILED`. Claiming increments an attempt/fencing token. Results are accepted only for the matching processing attempt; stale workers cannot overwrite a newer run. Bounded concurrency, deadlines, abort checks and shutdown hooks stop scheduling and prevent cancelled results from succeeding. Startup marks interrupted processing jobs failed; the user may retry. This runner targets **one API instance**, rather than a distributed queue.

The generated draft and questions are persisted together. Reloading does not lose work. Autosave uses an expected revision; stale edits receive a conflict instead of silently overwriting another tab/device. Clarification apply checks answer and draft revisions transactionally. Saving an answer alone does not change the CV; applying does. Preview and export use the persisted structured model; all final document fields, including work location and education details, are editable.

## Ownership and security

Passwords use Argon2. Sessions use random tokens, with only token hashes stored; cookies are HttpOnly and SameSite=Lax (Secure in production). Protected routes derive the user from the session, never a submitted user ID. CV queries are scoped to the owner; foreign and missing IDs return the same not-found behavior, including export and clarification routes.

RLS is intentionally omitted: access control lives in API query ownership checks, covered by e2e tests. Local browser protection relies on same-origin requests, SameSite cookies, JSON mutations and configured CORS; there is no separate CSRF-token protocol. Production hardening would add abuse/rate controls, deployment-specific CSRF review and infrastructure secret management. CV sources are sensitive database content; production logging must not include them or provider credentials.

## AI output and grounding limits

Anthropic is the only LLM provider. The adapter requests JSON schema structured output, validates it with Zod and domain rules, and maps only accepted content into the persisted draft. Prompts treat escaped CV source as untrusted data, forbid invented facts, tailor wording/relevance to the target role, and ask clarification questions for missing facts. Provider/validation failures have bounded retries and safe error codes. An empty draft without questions is rejected.

Mechanical grounding checks names, contact details, employers and institutions against normalized source text. Phone checks normalize formatting while rejecting short partial numbers. **Dates, job titles, skills, summary wording and achievement bullets are not fully fact-verified mechanically**; prompt instructions and explicit user review remain necessary. Strict source matching can reject unusual formatting or alternate names. This is not a guarantee that a model never hallucinates.

## PDF constraints

PDF uploads require the PDF type/signature, at most 5 MB and 50 pages. Extraction uses `unpdf`; only extracted text is persisted, not the original bytes. Image-only, encrypted/unreadable, empty and unsuitable PDFs return safe extraction errors. **No OCR** is implemented. Columns, sidebars and unusual font encoding can impair reading order; users can use free-text input or correct the draft manually. Export uses embedded fonts and selectable text on A4, rather than screenshots; export is from a completed, owned, persisted draft.

## Trade-offs and next steps

For the time-boxed assignment: one local deployment, one document template, a database-backed in-process runner, application ownership instead of RLS, and no OCR/distributed queue. Social login, payments, multiple templates, job-description input and external integrations are intentionally omitted. Containers retain build dependencies to keep the local migration/build workflow simple; smaller production images are future work.

Choices that can look like defects but are deliberate:

- Skills are prompt-grounded, not mechanically verified; only the real-model smoke test observes them.
- One API instance and no queue: a restart marks work in progress `FAILED` with reason `INTERRUPTED` instead of resuming it; a generation has a 5-minute limit.
- The editor's page count is an estimate from the preview height; real pagination happens in the PDF.
- A save conflict is resolved by choosing a whole version (yours or the stored one); nothing is merged.
- The migration of drafts to schema version 2 is one-way, and an editor tab open during the deploy must reload.
- Removing an experience or a skill category that holds something asks first; every other removal is immediate.
- The answer to a clarification question saves by itself after a pause (800 ms, not an approved value); only an explicit Apply changes the CV.
- Original PDFs are not stored; the text is extracted in-process, and there is no OCR.

With more time: broader real-world PDF fixtures and column reconstruction, stronger fact-level generation evaluation, automated browser acceptance, production rate limiting/CSRF review, retention/encryption policies for CV sources, and multi-instance recovery/queue coordination.

AI coding tools were used to draft implementation and tests, inspect failures, and review edge cases against the task/specifications. Repository changes and provider behavior require human review and verification; generated suggestions were not treated as proof of correctness. The specs and focused regressions record the chosen contracts and trade-offs.
