# Data Model: CV Editor, Clarifications & My CVs

One migration on top of 002. No new table. The draft document (`Cv.draft`) keeps its shape and caps (see `specs/002-cv-ai-generation/data-model.md`); this feature only makes it user-editable.

## Changes to `Cv`

| Column | Type | Rule |
|--------|------|------|
| `revision` | `Int NOT NULL DEFAULT 0` | Advances by exactly 1 on every accepted draft-content change (manual edit, clarification apply). Not touched by answer, dismiss, generation or retry. `CHECK (revision >= 0)` |

`updatedAt` keeps its `@updatedAt` behaviour (every Prisma write moves it, including generation transitions, retry, edit and apply). Answer and dismiss touch it explicitly in their transaction. Reads and the list never write.

Everything else on `Cv` (lifecycle columns, `draft`, the existing CHECKs) is unchanged. Deletion relies on the existing `ClarificationQuestion.cvId` FK with `ON DELETE CASCADE`.

## Changes to `ClarificationQuestion`

| Column | Before | After |
|--------|--------|-------|
| `status` | `QuestionStatus` = `OPEN`, `RESOLVED` | `QuestionStatus` = `UNANSWERED`, `ANSWERED`, `APPLIED`, `DISMISSED`; default `UNANSWERED` |
| `answer` | none | `TEXT NULL`, at most 1000 characters |
| `field` | none | `QuestionField NULL`: the single plain value an answer fills, when there is one |

```text
enum QuestionStatus { UNANSWERED ANSWERED APPLIED DISMISSED }

enum QuestionField {
  CONTACT_FULL_NAME CONTACT_EMAIL CONTACT_PHONE CONTACT_LOCATION CONTACT_LINK
  EXPERIENCE_EMPLOYER EXPERIENCE_TITLE EXPERIENCE_LOCATION EXPERIENCE_START_DATE EXPERIENCE_END_DATE
  EDUCATION_INSTITUTION EDUCATION_QUALIFICATION EDUCATION_START_DATE EDUCATION_END_DATE
}
```

`section`, `itemId`, `missing`, `question`, `position`, the `cvId` index and the cascade are unchanged. `itemId` still references an entry id inside `Cv.draft` by value (not a foreign key); an entry the user removed simply makes the target unavailable.

### Constraints (hand-written in the migration, as in 002)

```sql
CHECK (status <> 'ANSWERED'   OR answer IS NOT NULL)      -- an answered question has its answer
CHECK (status <> 'UNANSWERED' OR answer IS NULL)          -- an unanswered one has none
CHECK (answer IS NULL OR char_length(answer) <= 1000)
CHECK (field IS NULL OR left(field::text, length(section::text) + 1) = section::text || '_')
```

`APPLIED` is not forced to have an answer so that a pre-existing `RESOLVED` row (none is produced by 002) migrates without failing.

### Migration mapping

| Old | New |
|-----|-----|
| `OPEN` | `UNANSWERED` |
| `RESOLVED` | `APPLIED` |

Existing rows get `field = NULL` and `answer = NULL`. The type is replaced with the enum-swap pattern (new type, `ALTER COLUMN ... TYPE ... USING`, drop old, rename) because the CHECKs reference the new values in the same migration.

## State model

```text
                answer(text)                    answer(text) [edit]
 UNANSWERED ────────────────▶ ANSWERED ◀───────────────────────┐
     │                          │  │                            │
     │ dismiss                  │  └────────────────────────────┘
     ▼                          │ apply (draft changes in the same transaction)
 DISMISSED ◀── dismiss ─────────┤
                                ▼
                             APPLIED
```

| From | Action | To | Draft changes | `revision` | Preconditions |
|------|--------|----|---------------|-----------|---------------|
| `UNANSWERED` | answer | `ANSWERED` | no | unchanged | CV owned and `COMPLETED`; non-blank answer within 1000 chars |
| `ANSWERED` | answer | `ANSWERED` | no | unchanged | same |
| `UNANSWERED`, `ANSWERED` | dismiss | `DISMISSED` | no | unchanged | CV owned and `COMPLETED`; explicit request only |
| `ANSWERED` | apply | `APPLIED` | yes, atomically | +1 | CV owned and `COMPLETED`; request revision equals the CV revision; target available |
| `APPLIED`, `DISMISSED` | any | none | | | refused (`QUESTION_STATE_CONFLICT`) |

Resolved = `APPLIED`, `DISMISSED`. Unresolved = `UNANSWERED`, `ANSWERED`. A dismissed question keeps its answer (if it had one) for the record; it is never shown as pending again. Nothing in the system dismisses a question automatically.

## Derived shapes (not stored)

**Display status** (computed by `display-status.ts`):

| Generation status | Unresolved questions | Display status |
|-------------------|----------------------|----------------|
| `PENDING`, `PROCESSING` | any | `PROCESSING` |
| `FAILED` | any | `FAILED` |
| `COMPLETED` | 1 or more | `DRAFT` |
| `COMPLETED` | 0 | `COMPLETED` |

**Retry availability** (`canRetryGeneration`): `generationStatus = 'FAILED'`. Shared by `retry()` and the list. No separate flag is stored.

**List item** (read model): `id`, `targetRole`, `status` (`GenerationStatus`), `displayStatus`, `failureReason` (non-null exactly when `FAILED`), `canRetry`, `updatedAt`, `candidateName` (`string | null`; null when the draft has no non-blank `contact.fullName` or the CV has no draft), `openQuestionsCount`. Never `userId`, `sourceText`, `failureDetail`, the draft body or question text.

## Edit validation (request-time, not stored)

The edit body is `{ revision: int >= 0, draft: CvDraft }`, parsed with the existing `cvDraftSchema` (all caps and the "needs an employer or a title" / "institution or qualification" refinements) plus:

- entry ids unique inside the draft (experience and education together);
- `contact.email`, when non-null, is a syntactically valid email;
- `schemaVersion` is `1`.

Strings are trimmed; blank strings are rejected by the schema, so the client maps an emptied input to `null` (or removes the list item).

## Question-target resolution (apply)

| `section` | `itemId` | Target (chosen by the server) |
|-----------|----------|-------------------------------|
| `CONTACT` | null | `draft.contact` |
| `SUMMARY` | null | `draft.summary` |
| `EXPERIENCE` | entry id | the entry in `draft.experience` with that id |
| `EDUCATION` | entry id | the entry in `draft.education` with that id |
| `SKILLS` | null | `draft.skills` |

`field` (when set) names the single value inside that target. A missing entry, a filled scalar (or an existing summary) makes the target unavailable (`TARGET_NOT_APPLICABLE`).

## Invariants

1. A question belongs to exactly one CV; every question write is constrained by `cvId` (and the CV by `userId`).
2. `ANSWERED` implies a stored answer; `UNANSWERED` implies none (CHECK).
3. `APPLIED` is written only in the same transaction that changed the draft and advanced `revision`.
4. `revision` never decreases and advances only with a draft change.
5. A draft is edited only while `generationStatus = 'COMPLETED'`; a CV is deleted only while `COMPLETED` or `FAILED` (both enforced in the `WHERE` of the single write statement).
6. `field` and `section` agree (CHECK).
7. Foreign and missing CVs are the same `404 CV_NOT_FOUND` for every operation.
