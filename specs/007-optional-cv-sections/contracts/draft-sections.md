# Contract: optional sections in the draft

No new endpoint. The sections travel inside the draft of the existing, owner-scoped operations.

## Read: `GET /api/cvs/:id` (result) — and the draft inside `PUT` responses

`draft` gains: `languages`, `certifications`, `portfolio`, `hobbies`, `customSections` (see [data-model.md](../data-model.md)); always present in responses, `[]` when the CV has none.

## Write: `PUT /api/cvs/:id/draft`

Body: `{ revision, draft, targetRole? }` as before. `draft` may omit the new arrays (treated as empty) or include them. Rejected with `400` and field paths when:

- a limit is exceeded, an entry has a blank required field, or a level is not one of the five;
- a language name or a hobby repeats (ignoring case);
- an entry id repeats anywhere in the draft;
- a link is not a web address.

Ownership, `404` for a foreign or missing CV, revision conflicts (`409`) and the response are unchanged.

## Export: `GET /api/cvs/:id/pdf`

The PDF holds the sections after Skills, in the order Certifications, Languages, Portfolio, Hobbies, custom sections; a section without entries is omitted; text is selectable; links are clickable web links.

## Generation output (US4)

The structured output gains one optional list, `optionalItems`: items of `{ section: language | certification | portfolio | hobby | custom, name, detail, date, link }`, all strings with `""` for what the source does not say. The server sorts them into the five draft arrays. Five arrays of their own exceeded the provider's compiled-grammar limit, one list does. Validated like the rest; names and links must be traceable to the source.
