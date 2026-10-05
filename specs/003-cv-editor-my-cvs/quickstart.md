# Quickstart: Validating the CV Editor, Clarifications and My CVs

Run-and-verify guide for this feature once implemented. Behaviour is defined in [contracts/cv-editor-api.md](./contracts/cv-editor-api.md); data in [data-model.md](./data-model.md). Nothing here needs an Anthropic key except the scenarios marked **(key)**; automated tests never call the real API.

## Prerequisites

- Node 22+, pnpm 11, a PostgreSQL (Docker, or a local cluster when Docker is unavailable).
- `apps/api/.env` with `DATABASE_URL`. New optional variable:

| Variable | Default | Purpose |
|----------|---------|---------|
| `ANSWER_APPLY_TIMEOUT_MS` | `20000` | Per-attempt timeout of an AI-assisted apply (at most two attempts) |

## Setup

```bash
docker compose up -d postgres
pnpm install
pnpm --filter api prisma:migrate:deploy      # applies the 003 migration on top of 002
```

Migration checks (clean database, then a database holding 002 rows):

```bash
# 002 rows: every former OPEN question becomes UNANSWERED, revision starts at 0, field is NULL
psql "$DATABASE_URL" -c 'SELECT status, count(*) FROM "ClarificationQuestion" GROUP BY status'
psql "$DATABASE_URL" -c 'SELECT min(revision), max(revision) FROM "Cv"'
# the CHECKs hold: both statements below must be rejected
psql "$DATABASE_URL" -c "UPDATE \"ClarificationQuestion\" SET status='ANSWERED', answer=NULL"
psql "$DATABASE_URL" -c "UPDATE \"ClarificationQuestion\" SET field='EXPERIENCE_EMPLOYER' WHERE section='CONTACT'"
```

## 1. Automated checks (no key)

```bash
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api exec tsc --noEmit
pnpm --filter api lint
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```

Expected: all pass with `ANTHROPIC_API_KEY` unset.

## 2. API scenarios (cookie jars `a.jar`, `b.jar`)

Seed a `COMPLETED` CV with questions (the e2e seed helper, or complete a generation with a key). `API=http://localhost:3001/api`, `J='content-type: application/json'`.

```bash
# List: only A's CVs, newest update first, DTO has no draft or source text
curl -s -b a.jar $API/cvs

# Result carries the revision and four-state questions
curl -s -b a.jar $API/cvs/<ID>/result

# Edit with the current revision: 200 and the revision advances by one
curl -s -b a.jar -X PUT -H "$J" -d '{"revision":0,"draft":{...}}' $API/cvs/<ID>/draft
# Same body again (now stale): 409 REVISION_CONFLICT, nothing stored
curl -i -b a.jar -X PUT -H "$J" -d '{"revision":0,"draft":{...}}' $API/cvs/<ID>/draft
# Invalid email / too many skills: 400 with dotted fieldErrors keys
```

Questions:

```bash
Q=<QUESTION_ID>
curl -s -b a.jar -X PUT  -H "$J" -d '{"answer":"ada@example.com"}' $API/cvs/<ID>/questions/$Q/answer   # ANSWERED, content unchanged
curl -s -b a.jar -X POST -H "$J" -d '{"revision":1}' $API/cvs/<ID>/questions/$Q/apply                 # 200 CvResult, question APPLIED
curl -i -b a.jar -X POST -H "$J" -d '{"revision":2}' $API/cvs/<ID>/questions/$Q/apply                 # 409 QUESTION_STATE_CONFLICT
curl -s -b a.jar -X POST $API/cvs/<ID>/questions/<OTHER_Q>/dismiss                                    # DISMISSED, revision unchanged
```

Delete and retry rules:

```bash
curl -i -b a.jar -X DELETE $API/cvs/<PROCESSING_ID>   # 409 CV_GENERATION_ACTIVE
curl -i -b a.jar -X DELETE $API/cvs/<COMPLETED_ID>    # 204, gone from the list, questions gone
curl -s -b a.jar $API/cvs | jq '.items[] | {status, canRetry}'   # canRetry true only where POST /retry is accepted
```

Ownership (all must equal the response for a non-existent id, `404 CV_NOT_FOUND`):

```bash
curl -i -b b.jar -X PUT -H "$J" -d '{"revision":0,"draft":{...}}' $API/cvs/<A_ID>/draft
curl -i -b b.jar -X PUT -H "$J" -d '{"answer":"x"}' $API/cvs/<A_ID>/questions/$Q/answer
curl -i -b b.jar -X POST $API/cvs/<A_ID>/questions/$Q/dismiss
curl -i -b b.jar -X POST -H "$J" -d '{"revision":0}' $API/cvs/<A_ID>/questions/$Q/apply
curl -i -b b.jar -X DELETE $API/cvs/<A_ID>
curl -i -b b.jar $API/cvs/cnonexistentidxxxxxxxxxxx
```

CORS (a browser requirement the `inject()` tests cannot show):

```bash
curl -i -X OPTIONS -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: DELETE' $API/cvs/x
# expect Access-Control-Allow-Methods to include PUT and DELETE
```

## 3. Real AI apply **(key)**

With `ANTHROPIC_API_KEY` set, answer a question that has no `field` (for example a skills or experience question) and apply it. Expected: only that section or entry changes, existing bullets and filled values are untouched, nothing the answer did not state appears. Also create a new CV: its questions about a missing email or a missing date should now carry a `field` (check with `psql`), and applying such a question must perform no AI request (watch the API log: no provider call).

## 4. Web scenarios (manual, 320 to 1280 px)

```bash
pnpm --filter api start:dev
pnpm --filter web dev
```

| Step | Expected |
|------|----------|
| Sign in or register | Lands on `/cvs`; "My CVs" is the active navigation item |
| `/cvs` with no CVs | The Figma empty state and the privacy note |
| `/cvs` with CVs in every state | Cards sorted by last update; badges Processing, Failed, Draft, Completed; name or `Untitled CV`; role; time; message; question count |
| Processing card | "View progress" only; no enabled Delete; the list refreshes about every 5 s and stops when none is active (Network tab) |
| Failed card | "Try again" only when `canRetry`; Delete works |
| Draft and Completed cards | Open; Delete; Download PDF visible and disabled |
| Delete | Confirmation dialog; Cancel keeps the CV; Confirm removes it from the list; its address shows the not-found page |
| Open a completed CV | Editor left, A4 preview right (single column on mobile); no horizontal scroll at 320 px |
| Type in any section, add and remove a bullet | Preview updates at once; indicator Saving then Saved; reload shows the same content |
| Go offline and type | Error with retry; local text kept; no "Saved" |
| Two tabs, save in one, then type in the other | Conflict banner; "Load latest" or "Keep my changes"; newer content never lost silently |
| Answer a question | Card becomes Answered; the CV content is unchanged; count unchanged |
| Apply | The target changes, the card becomes Applied, the count drops, other manual edits are unchanged |
| Dismiss | The card becomes Dismissed, the count drops, the CV is unchanged; reload keeps it |
| Browser storage | `localStorage` and `sessionStorage` hold no CV content |

## 5. Final review

- The diff matches the spec's acceptance criteria AC-001 to AC-013 and success criteria SC-001 to SC-012.
- Logs from the runs above contain no draft text, answers, prompts, raw model output, API key or cookie values.
- The suite passes with `ANTHROPIC_API_KEY` unset; the 002 smoke test (T040) is run once with a key before delivery and now also exercises `field`.
