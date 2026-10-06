# Research: Submission Readiness

## R1. How the stack starts

- **Decision**: three Compose services (PostgreSQL, API, web). The API waits for a healthy database, applies the checked-in migrations and starts; the web app waits for a healthy API. Health checks: the database's readiness probe, and for the API a request that must be answered `401` by the running auth guard (proves the app, not just the port, is up).
- **Rationale**: the reviewer needs one command and no ordering knowledge; a failed migration must stop the start instead of masking schema drift.
- **Alternatives**: a start script outside Compose (hides the order, not portable); running migrations as a separate job service (more moving parts for no gain at this scale).

## R2. Browser to API path in the container run

- **Decision**: the browser calls the web app's own `/api` path, which the web server forwards to the API's internal address; server-side rendering uses the internal address directly.
- **Rationale**: same origin means the session cookie works with no cross-origin configuration and no hard-coded host in the browser bundle; one setting (`API_INTERNAL_URL`) covers the container case.
- **Alternatives**: a reverse-proxy service (a fourth service); direct browser calls to the API port (needs origin and cookie configuration that breaks when ports change).

## R3. Configuration and secrets

- **Decision**: only the key and the model are meant to be set by the reviewer (`.env.example`); ports are overridable; database credentials in Compose are local defaults. The API keeps validating its environment at start (`apps/api/src/config/env.ts`). An empty key counts as absent.
- **Rationale**: constitution XV; the existing behaviour already lets the app start without a key and end generations in `PROVIDER_NOT_CONFIGURED`, which satisfies FR-004 with no new code.
- **Alternatives**: failing the start without a key (rejected: it would block reviewing everything except generation).

## R4. Data across restarts

- **Decision**: a named volume for PostgreSQL; `docker compose down` keeps it, `down -v` deletes it and is documented as destructive.
- **Rationale**: SC-003.

## R5. README structure

- **Decision**: sections map to the constitution's eight questions: Run (Docker), Local development, Verification (tests), Architecture and lifecycle, Ownership and security, AI output and grounding limits, PDF constraints, Trade-offs and next steps (including how AI coding tools were used). The trade-offs of features 002 to 005 that a reviewer could mistake for defects are listed in one place.
- **Rationale**: FR-006 to FR-008; a reviewer can check the eight questions by reading headings.
- **Alternatives**: a docs folder with several files (a reviewer reads one file first).

## R6. PDF preparation message

- **Decision**: an overlay inside the full-screen preview's own dialog (so it sits above the document in the top layer): a soft dimming, a centred surface with a spinner, "Preparing your PDF…", "We're formatting your CV for download." and the file name. The navigation action reads "Preparing…" and is disabled. It appears at once and stays at least 700 ms; it announces itself politely, never takes focus, and does not prevent closing the preview (the download completes in the background).
- **File name**: shown from the candidate name and target role by the same rule the server uses for the real name (`<Name>-<Role>.pdf`, letters, digits and single dashes, at most 80 characters), so the shown name equals the delivered one in normal cases.
- **Rationale**: Figma 10.5; the minimum time avoids a flash on fast downloads (owner decision: always show it); no focus steal keeps keyboard flow intact.
- **Alternatives**: showing the file name from the response header (unknown until the request ends); a blocking modal (would trap the person).

## R7. Code organisation by feature

- **Decision**: keep the existing `features/*` + `entities` + `shared` layout and the file-structure rule; no further moves in this feature. The requirement is verified by locating one area's code in one place and by the full checks passing.
- **Rationale**: the moves are done and verified by the passing suite; more churn near hand-in is risk without value.
