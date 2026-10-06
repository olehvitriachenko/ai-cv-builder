# Data Model: Optional CV Sections

The draft (`Cv.draft`, JSON) keeps `schemaVersion: 2` and gains these top-level arrays. Each defaults to `[]` when absent. Text is trimmed and never empty; absent values are `null`. Ids are client-generated strings, unique across all entries of the draft.

| Field | Entry | Fields and limits | Array limit |
|-------|-------|-------------------|-------------|
| `languages` | Language | `id`; `name` text 1–60 (unique ignoring case); `level` one of `A1`, `A2`, `B1`, `B2`, `C1`, `C2`, `Native speaker` or `null` | 12 |
| `certifications` | Certification | `id`; `name` 1–120; `issuer` 1–120 or `null`; `date` 1–40 or `null` (month and year, not in the future); `link` 1–200 or `null` (web address) | 15 |
| `portfolio` | Project | `id`; `name` 1–120; `link` 1–200 or `null` (web address); `description` 1–300 or `null` | 8 |
| `hobbies` | — (a string) | text 1–60 each | 15 |
| `customSections` | Custom section | `id`; `title` 1–60; `content` 1–1200 (line breaks kept) | 3 |

## Rules

- A section with no entries is not stored (the editor drops it before saving; the server accepts an empty array).
- Entry ids of all sections are unique across experience, education and the new sections (extends the existing id rule).
- Language names are unique ignoring case; hobbies are unique ignoring case.
- Links follow the editor's existing link rule and are re-checked on the server.
- Reading a stored draft without these fields yields empty arrays.

## Not changed

Experience, education, skills, contact; `revision`; the clarification question model (until R6 in research); the database schema.
