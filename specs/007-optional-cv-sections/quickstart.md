# Quickstart: validating optional sections

Prerequisites: PostgreSQL running, `pnpm install`, the API `.env` in place (no AI key is needed for US1–US3).

## Automated

```sh
pnpm typecheck && pnpm lint
pnpm test          # schema, round trip, offering rules, PDF text
pnpm test:e2e      # edit body rules, ownership, export
```

## Scenario 1 — Languages end to end (US1)

1. Start the dev servers, sign in, open a completed CV.
2. Under the existing sections the **Add a section** card shows four options and **+ Custom Section**.
3. Press **Languages**: a card appears, focus is on its first field, the option is gone.
4. Press **Add Languages** (a new section starts empty, with no field focused), then add "English — C1" and "Ukrainian — Native speaker": the preview shows the block.
5. Download the PDF: the block is there as selectable text. Reload: it is still there.
6. Remove the section: a question appears; confirm; it disappears everywhere and the option returns.

## Scenario 2 — The other sections (US2, US3)

Add Certifications (name, issuer, date, link), Portfolio, Hobbies and a Custom section; check the order in the preview and the PDF, an invalid link message, the 13th language refused, a duplicate language flagged.

## Scenario 3 — Old CVs and phones

Open a CV created before this feature: unchanged preview and PDF, all four options offered. Repeat scenario 1 at 390 and 320 px: no horizontal scrolling; options stack one per row.

## Scenario 4 — Generation (US4, after the rest)

Generate from a source listing languages with levels (mocked provider in tests, a real key for a manual run): the sections hold only the source's values; a language without a level has none.
