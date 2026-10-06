# AI CV Builder

A take-home implementation of an AI-assisted CV builder with email/password authentication, user-owned CVs, Anthropic generation from free text or selectable-text PDFs, clarification questions, structured manual editing, autosave, live preview, and A4 PDF export.

The implementation focuses on the complete user flow, persistence, ownership, generation reliability, explicit AI-output validation, and transparent trade-offs within a time-boxed assignment.

## Product & UX process

I used Figma as part of the engineering workflow to design and validate the main product flows before and during implementation.

The design covers:

- CV creation from free text or PDF
- generation/loading/failure states
- clarification UX
- structured CV editing
- live A4 preview
- empty states
- destructive actions
- desktop and mobile behavior

**Figma:** [Open the AI CV Builder design](https://www.figma.com/design/eIMIhyfYr4eO9gs2pZxhqJ/Untitled?node-id=0-1&t=mbvCRdXiIN1QxVlh-1)

The design was treated as a working artifact rather than a fixed mockup. Interactions were iterated after implementing and testing the actual flow.

The goal was to keep product and UX decisions inside the engineering process rather than treating UI as a final styling pass.

---

## Run with Docker

### Prerequisites

- Docker Desktop, or Docker Engine with Compose
- Internet access for the first image build and Anthropic calls

No host Node.js or database installation is required.

```sh
cp .env.example .env

# Set ANTHROPIC_API_KEY in .env using your editor.

docker compose up --build
```

Open:

**http://localhost:3000**

Sign up and create a CV.

Subsequent starts can use:

```sh
docker compose up
```

PostgreSQL, migrations, API, and web start automatically.

The only required external secret is:

```env
ANTHROPIC_API_KEY=
```

Database credentials in Compose are local-development defaults.

Without an Anthropic key, the application still starts, but generation fails safely with:

```text
PROVIDER_NOT_CONFIGURED
```

The default model is:

```text
claude-sonnet-5-5
```

It can be overridden with:

```env
ANTHROPIC_MODEL=
```

### Services

- Web: http://localhost:3000
- API: http://localhost:3001/api
- PostgreSQL: localhost:5432 by default

Browser requests use the web application's same-origin `/api` proxy. Server rendering uses the internal API address.

PostgreSQL data survives restarts using a named Docker volume.

API startup runs:

```sh
prisma migrate deploy
```

This applies checked-in migrations and stops startup if a migration fails. It does not reset data or generate new migrations automatically.

### Port overrides

If the default ports are occupied:

```sh
WEB_PORT=3100 \
API_PORT=3101 \
POSTGRES_PORT=55432 \
docker compose up --build
```

Defaults:

```text
WEB_PORT=3000
API_PORT=3001
POSTGRES_PORT=5432
```

Local Compose uses HTTP and non-Secure cookies.

An internet deployment would require:

- HTTPS
- `NODE_ENV=production`
- secure database credentials
- appropriate allowed origins
- production secret management

This Compose configuration is intended for local evaluation.

### Stop the stack

```sh
docker compose down
```

This retains PostgreSQL data.

To remove the local database volume:

```sh
docker compose down -v
```

This is destructive.

---

## Local development

### Prerequisites

- Node.js 24
- pnpm 11
- Docker for PostgreSQL

```sh
pnpm install --frozen-lockfile

cp apps/api/.env.example apps/api/.env

# Set ANTHROPIC_API_KEY in apps/api/.env.

pnpm db:up
pnpm db:migrate
pnpm dev
```

Open:

- Web: http://localhost:3000
- API: http://localhost:3001/api

The API `.env` contains local database and origin defaults.

The repository generates required framework artifacts as part of the relevant scripts:

- Prisma client generation is handled before API development, typecheck, lint, tests and build.
- Web typecheck generates Next.js route types before running TypeScript.

Generated clients and framework artifacts therefore do not need to be committed.

Environment files:

- root `.env` — Docker Compose
- `apps/api/.env` — host development and real-provider smoke tests

Both should remain outside Git.

---

## Verification

Run:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Automated tests do not call the real AI provider.

### Unit tests

API and web unit tests require neither:

- PostgreSQL
- Anthropic credentials

### API e2e tests

API e2e tests require PostgreSQL, but not an Anthropic key.

They:

- create/use a separate test database
- apply migrations
- remove the Anthropic key from the test environment
- substitute fake AI providers

The database is named using the configured database with a `_test` suffix.

The configured PostgreSQL user must have permission to create the test database.

There is no separate automated browser e2e suite. Integrated browser acceptance is used for the full application flow.

### Optional real Anthropic smoke tests

These make real provider calls and incur Anthropic usage:

```sh
pnpm --filter api test:smoke
```

Smoke setup loads:

```text
apps/api/.env
```

The smoke suite is isolated from unit and e2e runs.

Never print the API key or commit `.env` files.

---

## Architecture

The project is a pnpm monorepo.

```text
apps/
  web/
  api/

packages/
  skill-catalogue/
```

### `apps/web`

Next.js App Router frontend using:

- React
- React Hook Form
- React Query
- Zod
- server-side authenticated loading
- client-side editing and polling

### `apps/api`

NestJS + Fastify REST API using:

- Prisma
- PostgreSQL
- isolated Anthropic adapters
- PDF ingestion
- PDF export
- persistent generation lifecycle
- revision-aware editing

### `packages/skill-catalogue`

Shared skill catalogue used by both API and web.

PostgreSQL owns:

- accounts
- hashed sessions
- CV source text
- structured drafts
- revisions
- generation status
- clarification records

---

## Generation lifecycle

A CV row is also the durable generation job.

```text
PENDING
   ↓
PROCESSING
   ↓
COMPLETED | FAILED
```

Generation is not tied to a long-running HTTP request.

Claiming a generation increments an attempt number that acts as a fencing token.

Results are accepted only when they belong to the currently active processing attempt. A stale worker therefore cannot overwrite the result of a newer retry.

The runner also uses:

- bounded concurrency
- generation deadlines
- abort checks
- shutdown hooks
- stale-attempt protection
- startup recovery

If the API stops while processing a generation, startup marks the interrupted attempt as failed with an `INTERRUPTED` reason.

The user can explicitly retry.

This runner intentionally targets **one API instance** rather than pretending to implement a distributed worker system inside a small take-home.

A multi-instance deployment would require explicit coordination such as leases, database locking or a dedicated queue.

---

## Persistence, autosave and concurrency

Generated draft data and clarification questions are persisted together.

Reloading during or after generation does not lose work.

The editor uses optimistic concurrency through an expected draft revision.

If another tab or device has already saved a newer version, the stale client receives a conflict instead of silently overwriting it.

Conflict resolution intentionally operates on the whole CV version rather than attempting an automatic field-level merge.

Clarification apply also checks both:

- current draft revision
- current clarification answer

inside the apply flow.

Saving an answer alone does not change the CV.

Only explicit **Apply** updates the draft.

If the model filled an uncertain field and also asked a clarification question about it, the question remembers the original generated target value.

The user's answer may replace that uncertain AI value only while it remains unchanged.

A later manual user edit always has priority and is never overwritten by a stale clarification.

---

## Ownership and security

Passwords are hashed using Argon2.

Sessions use random tokens. Only hashes of session tokens are stored in PostgreSQL.

Session cookies are:

- `HttpOnly`
- `SameSite=Lax`
- `Secure` in production

Protected routes derive the authenticated user from the session.

They never trust a submitted user ID.

All CV operations are scoped to the authenticated owner, including:

- CV retrieval
- editing
- deletion
- generation retry
- clarification answers
- clarification apply
- PDF export

Foreign and missing CV IDs intentionally return the same not-found behavior.

### Why PostgreSQL RLS is not used

PostgreSQL Row-Level Security is intentionally omitted because of the assignment time-box.

Ownership is enforced consistently at the application layer and covered by cross-user e2e tests.

Adding RLS safely would require more than enabling a table policy. The application would also need an explicit strategy for:

- request-scoped database identity
- background generation
- retries
- recovery paths
- worker/database context

Within the available time I prioritized:

- consistent ownership checks
- concurrency safety
- generation reliability
- AI-output validation
- complete end-to-end behavior

over adding a second authorization layer superficially.

With more time, RLS would be a natural **defense-in-depth** improvement rather than a replacement for application-level authorization.

### Additional production hardening

The local browser model relies on:

- same-origin requests
- SameSite cookies
- JSON mutation endpoints
- configured CORS

There is no separate CSRF-token protocol.

A production deployment should additionally consider:

- rate limiting
- abuse protection
- deployment-specific CSRF review
- infrastructure secret management
- session lifecycle hardening
- retention/encryption policy for stored CV source text

Sensitive CV source content and provider credentials must never be written to application logs.

---

## AI generation and anti-hallucination strategy

Anthropic is the only LLM provider.

The adapter requests structured JSON-schema output and applies multiple validation layers before persisting a generated draft.

The pipeline includes:

1. provider-level structured output
2. Zod validation
3. domain validation
4. explicit source grounding
5. user clarification
6. final human review/editing

Prompts treat the CV source as untrusted input and explicitly forbid invented facts.

The source is separated from system instructions so prompt injection inside the CV is treated as data rather than instructions.

Generation also asks clarification questions when relevant facts are missing or uncertain.

Provider and validation failures use bounded retry behavior and safe error codes.

An empty draft with no clarification questions is rejected.

---

## Mechanical grounding

Some explicit facts are checked mechanically against the user's source.

This includes:

- name
- email
- phone
- links
- employers
- educational institutions
- experience dates
- education dates
- generated skills
- explicit numeric/quantitative claims in supported core fields

Phone matching normalizes formatting while rejecting short partial fragments.

Quantitative checks cover digit-based quantities and common English number words. Percentages retain their unit.

For core CV sections, an unsupported grounded fact rejects the draft and may trigger the bounded retry.

### Optional sections

Optional-section items include things such as:

- languages
- certifications
- projects
- hobbies
- custom sections

Their factual values are checked, but unsupported optional items are removed individually instead of failing an otherwise valid core CV.

A custom section title such as:

```text
Publications
```

is treated as a structural/presentation label, not as a factual claim that must appear literally in the source.

Questions about optional sections are currently not persisted because the clarification model does not provide a deterministic destination for those answers.

### Clarification patch grounding

AI-assisted clarification patches validate only the data introduced by the patch.

Added facts such as:

- skills
- dates
- locations
- organisations

must be supported by the user's clarification answer.

Numbers introduced into added text must come from:

- the clarification answer, or
- the existing record being extended where appropriate

Existing valid CV content is not revalidated against only the latest answer.

This avoids rejecting legitimate previously persisted facts.

---

## Grounding limits

Mechanical source matching does **not** prove complete semantic truth.

The following remain partially dependent on model instructions and explicit user review:

- job titles
- qualifications
- language levels
- attribution of an otherwise valid number to the correct achievement
- semantic meaning of paraphrased prose
- arbitrary factual relationships expressed without mechanically checkable tokens

For example, finding `35%` somewhere in the source does not mathematically prove that every sentence using `35%` attributes it to the correct achievement.

Strict source matching can also reject:

- unusual formatting
- alternate names
- translations
- semantic paraphrases

The system therefore does not claim that hallucination is impossible.

The goal is to reduce obvious unsupported factual additions while keeping the user in control of the final document.

---

## Clarification model

Missing or uncertain information may become clarification questions.

Core clarification targets include:

- contact information
- summary
- experience
- education
- skills

Answers save independently after a short debounce.

Saving an answer does **not** modify the CV.

The user must explicitly choose **Apply**.

Apply may:

- fill an empty field
- replace an uncertain AI-generated value if it has not changed since the question was created

Apply will not overwrite a value that the user later edited manually.

Optional-section questions are filtered because the current schema does not provide a reliable deterministic destination for those answers.

---

## PDF ingestion

PDF uploads require:

- PDF type/signature
- maximum size of 5 MB
- maximum 50 pages

Extraction uses `unpdf`.

Only extracted text is persisted. The original PDF bytes are not stored.

The following return safe extraction errors:

- image-only PDFs
- encrypted/unreadable PDFs
- empty PDFs
- malformed PDFs
- unsuitable PDFs

### Why OCR is not implemented

OCR is intentionally outside the scope of this time-boxed assignment.

Adding OCR properly would introduce:

- another extraction pipeline
- additional dependencies
- more CPU/memory considerations
- confidence/error handling
- more test fixtures
- more failure modes

The assignment can still support the required workflow reliably using:

- selectable-text PDFs
- free-text input

Within the time-box, I prioritized the main generation/editing/export flow over adding an OCR pipeline superficially.

With more time, OCR would be introduced as a fallback for image-only documents rather than replacing the current text-layer extraction path.

### Known PDF extraction limitations

Text-layer extraction may be less accurate for:

- multiple columns
- sidebars
- unusual font encodings
- complex visual layouts

Users can fall back to free-text input or manually correct the generated draft.

---

## PDF export

Export uses `@react-pdf/renderer`.

The output is:

- A4
- selectable text
- multi-page capable
- owner-protected
- generated from the latest persisted completed draft
- compatible with Cyrillic/non-ASCII text through embedded fonts
- capable of clickable `mailto`, `tel` and `https` links

Export is generated as text rather than a screenshot.

This keeps the resulting CV selectable and machine-readable.

---

## Preview behavior

The HTML editor preview is designed to approximate the final A4 document.

Its page boundaries and page count are intentionally marked as approximate.

The browser preview and PDF renderer use different layout engines, so pagination may differ slightly.

The exported PDF is the authoritative final layout.

Stored source dates remain exactly as written when possible, for example:

```text
Sept 2019
Summer 2017
now
```

A persisted source date does not block saving unrelated editor changes.

If the user actively changes a date, the edited value must use a format supported by the date picker.

Education stores an explicit optional `ongoing` choice with each draft entry, so expected graduation in the current year remains distinct from a completed degree. Existing entries without this field keep their previous date-based interpretation. Source-derived `now` is recognized as ongoing experience without rewriting it on unrelated saves.

---

## Intentional trade-offs

This was a deliberately time-boxed implementation.

I prioritized:

- the complete product flow
- data persistence
- ownership
- generation lifecycle reliability
- concurrency protection
- AI-output validation
- manual editability
- reliable PDF export

over production-scale infrastructure and secondary ingestion paths.

The main deliberate omissions are:

- PostgreSQL RLS
- OCR
- distributed job queue / multi-instance workers

Each would add meaningful architectural surface area that should be designed and tested properly rather than added superficially.

Other intentional decisions:

### One API instance

The generation runner targets one API instance.

A restart marks active work as interrupted instead of silently resuming it.

A generation has a five-minute limit.

### No distributed queue

PostgreSQL stores durable job state, while execution remains in-process.

For this local take-home this avoids introducing Redis/RabbitMQ/SQS infrastructure without a real scaling requirement.

### Whole-document conflict resolution

Concurrent editor conflicts are resolved by choosing one full version.

There is no automatic field-level merge.

### Approximate browser pagination

HTML preview pagination is approximate.

PDF export owns final pagination.

### One-way draft migration

Draft schema migration to version 2 is intentionally one-way.

An editor tab open during deployment must reload.

### Clarification apply is explicit

Clarification answers autosave after an 800 ms debounce.

This debounce duration is an implementation choice, not a product requirement.

Only an explicit Apply changes the CV.

### Original PDFs are not stored

The ingestion pipeline persists extracted source text only.

This reduces storage surface and keeps the implementation focused on the CV-generation workflow.

---

## Out-of-scope features

The following are intentionally not implemented:

- OAuth/social login
- password reset
- email verification
- payments
- admin panel
- multiple CV templates
- job-description-specific tailoring input
- external integrations

These were either outside the assignment scope or lower priority than the core reliability requirements.

---

## With more time

The next improvements I would prioritize are:

1. broader real-world PDF fixtures
2. stronger multi-column reconstruction
3. OCR fallback for image-only PDFs
4. PostgreSQL RLS as defense in depth
5. stronger fact-level generation evaluation
6. automated browser acceptance tests
7. production rate limiting and abuse protection
8. deployment-specific CSRF hardening
9. retention/encryption policy for CV source data
10. multi-instance generation coordination or dedicated queue infrastructure

---

## AI-assisted development

AI coding tools were used during implementation to:

- draft implementation ideas
- generate test scaffolding
- investigate failures
- review edge cases
- compare behavior against the task specification
- help inspect architecture and trade-offs

Generated code and suggestions were not treated as proof of correctness.

Repository changes were reviewed, tested and verified against the expected behavior.

The project includes focused regression tests and specifications that record important contracts and deliberate trade-offs.