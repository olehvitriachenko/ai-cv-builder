# Implementation Plan: Optional CV Sections

**Branch**: `007-optional-cv-sections` | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-optional-cv-sections/spec.md`

## Summary

Add five optional sections to the CV — Languages, Certifications, Portfolio, Hobbies and up to three Custom sections — chosen from the new **Add a section** card. A section lives in the CV draft next to the existing parts, is edited in the structured editor, shows in the A4 preview and in the exported PDF, and is saved by the existing autosave (US1–US3). The generator fills them from the source last (US4).

Approach: **additive, not a new version**. The stored draft keeps `schemaVersion: 2` and gains five arrays that default to empty when absent, so every stored CV still parses, nothing is migrated and the database schema does not change. The server schema is the authority and the web schema, form model, preview and PDF follow it; the editor keeps an empty section only in the browser until it holds an entry, as skill categories do today.

## Technical Context

**Language/Version**: TypeScript (strict), Node.js 24, pnpm 11 workspace

**Primary Dependencies**: existing only: NestJS/Fastify, Zod, `@react-pdf/renderer`, Next.js 16, React 19, React Hook Form, Tailwind; no new dependency

**Storage**: PostgreSQL; `Cv.draft` is JSON, so the new arrays need no migration. A Prisma migration appears only if US4 adds clarification sections (see research R6)

**Testing**: Vitest — API unit and e2e (separate `_test` database, Anthropic mocked), web unit; browser checks with Playwright against the dev servers

**Target Platform**: browser (desktop and phone) and the existing API

**Project Type**: web application (monorepo `apps/api`, `apps/web`)

**Performance Goals**: no change to save or export time that a person can notice; the draft grows by at most a few kilobytes

**Constraints**: backward compatible stored drafts; the server re-validates every save; no invented facts from the AI; ownership on every operation; phone layout works at 320 px

**Scale/Scope**: per CV at most 12 languages, 15 certifications, 8 projects, 15 hobbies and 3 custom sections

## Constitution Check

*GATE: passed before research; re-checked after design (below).*

| Principle | Result |
|-----------|--------|
| I Product contract | The CV keeps its five parts; the new sections are optional additions the owner asked for and designed (Figma `112:4845`) |
| II Strict types / validation at boundaries | One Zod schema per section on the server (authority) and a mirror on the web; no `any`; the stored JSON is parsed on read |
| III Reliability over breadth | Additive shape, no migration, old CVs unchanged (SC-003); US4 last and separable |
| V Ownership | No new endpoint; sections travel inside the existing owner-scoped draft read, edit and export |
| VI/VII AI never invents, output validated | US4 reuses the trust model: structured output → Zod → source-grounding check → persistence; missing values become questions or stay empty |
| X Critical behaviour tested | Schema limits and uniqueness, draft round trip, PDF content parity, form rules, the section card's offering logic |
| XI User control | Every section and entry is editable and removable; nothing is added without a press |
| XII Simplicity | One generic "section" pattern in the editor, no plugin system; fixed order, no reordering |
| XIII Scope | The five sections of the design only; out-of-scope items are listed in the spec |

No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/007-optional-cv-sections/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/draft-sections.md
├── checklists/requirements.md
└── tasks.md            (by /speckit-tasks)
```

### Source Code (repository root)

```text
apps/api/src/modules/cv/generation/draft.schema.ts        # five new arrays, limits, entry schemas
apps/api/src/modules/cv/schemas/draft-edit.schema.ts      # uniqueness, link and id rules for the new entries
apps/api/src/modules/cv/generation/draft-mapper.ts        # (US4) map generated sections into the draft
apps/api/src/modules/cv/generation/draft-validation.ts    # (US4) grounding of the new values in the source
apps/api/src/modules/ai/schemas/llm-cv-output.schema.ts   # (US4) optional sections in the structured output
apps/api/src/modules/ai/prompts/cv-draft.prompt.ts        # (US4) allowed and forbidden transformations
apps/api/src/modules/pdf/export/cv-pdf.document.tsx       # the sections in the PDF
apps/web/src/entities/cv/schemas.ts                        # mirror of the draft schema
apps/web/src/features/cv-editor/model/draft-form.ts        # form values, round trip, validation, new entries
apps/web/src/features/cv-editor/model/optional-sections.ts # which sections are offered, which are shown
apps/web/src/features/cv-editor/components/sections/       # Add a section card + one card per section
apps/web/src/features/cv-editor/components/preview/cv-document.tsx
apps/web/src/features/cv-editor/model/conflict-review.ts   # the sections in the conflict choice
```

**Structure Decision**: extend the existing modules in place; one new web folder (`components/sections/`) for the card and the five section cards, and one small model file for the offering rules, following the feature-first layout in `.claude/rules/file-structure.md`.

## Phases and order

1. **API shape (US1–US3)**: schema, edit rules, PDF; tests first. Green on its own because the arrays default to empty.
2. **Web shape**: schema mirror, form model with round-trip and rules, preview; tests first.
3. **Web editor (US1)**: the card, Languages end to end, remove with confirm; then the other sections (US2) and Custom (US3) on the same pattern.
4. **Verification**: unit, e2e, browser at 1440, 390 and 320 px, downloaded PDF text.
5. **Generation (US4)**: structured output, prompt, mapper, grounding, tests with a mocked provider; clarification for a missing level only if research R6 allows it without a migration.

## Complexity Tracking

None.
