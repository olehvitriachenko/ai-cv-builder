# Research: CV PDF Export

Decisions that shape the plan. Items marked **verified** were checked with throwaway scripts against the installed packages on this repository (Node 24, `@react-pdf/renderer` 4.9.0, `unpdf` 1.8); no project code was written for them.

## D-1. PDF library: `@react-pdf/renderer` (already declared)

- **Decision**: Use `@react-pdf/renderer` 4.9.0, which `apps/api/package.json` already declares and `.claude/rules/backend.md` mandates ("MUST use `@react-pdf/renderer`", A4, selectable text, no screenshots).
- **Verified**: it renders in the API's Node/ESM environment; `renderToBuffer` produced a valid `%PDF` with page size 595.28 x 841.89 pt (A4), 4 pages for 120 lines, in ~200 ms; text is real text (read back with `unpdf`, which is already a dependency).
- **Consequence**: **one missing runtime dependency**: `react`. `@react-pdf/renderer` lists it as a peer, and `apps/api` does not depend on it (only the pnpm virtual store links it for the library). Importing `react/jsx-runtime` from API code needs a direct dependency. Add `react@19.2.8` (the exact version `apps/web` already uses) and `@types/react` to `apps/api`. This is not a new technology: it is the library's own peer.
- **Rejected**: headless-browser PDFs (screenshots or print, heavy, violates "no screenshot-based PDFs"), `pdfkit`/`pdf-lib` directly (a second PDF stack with no layout engine), a client-side PDF (not owner-enforced, not the persisted state).

## D-2. JSX in the API

- **Decision**: write the template as `.tsx` and add `"jsx": "react-jsx"` to `apps/api/tsconfig.json`.
- **Why**: the template is ~150 lines of nested layout; `createElement` calls would be much harder to review. Vitest (esbuild) reads the same tsconfig; `nest build` compiles `.tsx` with `tsc`.
- **Rejected**: `createElement` without a config change (readable only for tiny templates).

## D-3. Fonts must be embedded (Cyrillic)

- **Finding (verified)**: the built-in PDF fonts (Helvetica, Times) have no Cyrillic. Rendering "Олена Іваненко" with them produced garbage text (`;5=0 ...`) in the file. The product's UI loads the Cyrillic subset and users write CVs in Ukrainian, so this is a correctness bug, not polish.
- **Decision**: embed TrueType fonts that match the on-screen A4 preview: **Inter** (Regular 400, Medium 500, SemiBold 600) for headings and meta text, **Lora** (Regular, Italic) for body text. Vendor the `.ttf` files under `apps/api/assets/fonts/` with their OFL licence texts. Register them once at module load.
- **Note**: `@react-pdf` needs static TTF/WOFF instances (not variable fonts, not WOFF2). The web app's `next/font` files are WOFF2 and cannot be reused.
- **Needs approval**: fetching the font files is a download from outside the repository (Google Fonts / upstream release). Raised as a gate in the plan; nothing is downloaded yet.
- **Rejected**: built-in fonts (breaks Cyrillic), a runtime download of fonts (network at export time, a new failure mode), base64 fonts inside source (unreviewable diff).

## D-4. Font file location survives `nest build`

- `tsconfig` has `rootDir: "."`, `outDir: dist`, so `src/modules/pdf/export/x.ts` compiles to `dist/src/modules/pdf/export/x.js`. From both locations the path `../../../../assets/fonts` lands in `apps/api/assets/fonts` (source) and `dist/assets/fonts` (build). One relative path works for tests, dev and production.
- **Decision**: resolve fonts with `new URL('../../../../assets/fonts/<file>', import.meta.url)` and make `nest build` copy `assets/fonts/**` to `dist/assets/fonts` through the `assets` option in `nest-cli.json`. A build-output check is part of the verification (see tasks).

## D-5. Pagination and long text

- **Hyphenation off (verified)**: the library's default hyphenation rewrites words ("example" became "exam-ple" inside a URL). Disable it with `Font.registerHyphenationCallback((word) => [word])`, so text is exactly what the draft holds and stays searchable.
- **Long unbroken tokens (verified)**: with hyphenation off a 240-character link ran to x = 600 pt, past the right margin (limit 541 pt); a zero-width-space break opportunity did not help (still one line, text cut). Splitting the token into 40-character chunks inside a wrapping row kept every line inside the margins (right edge 499 pt) over 3 lines, and the text read back from the PDF was **identical** to the original (no inserted characters). Apply this only to tokens longer than a threshold; normal paragraphs stay plain text.
- **Page breaks**: use the library's `wrap`, `minPresenceAhead` (heading keeps a few lines with it) and `wrap={false}` on the title line plus first bullet of an experience entry so a page never ends between them. Remaining bullets flow normally.
- **Verification without eyes**: `unpdf` returns page count, page size and positioned text. Tests assert A4, page count, that every draft string is present, and that every text item's right edge is within the margin.

## D-6. Endpoint shape: `GET /api/cvs/:id/pdf`

- **Decision**: a sub-resource of the CV next to `/result`. `GET`: the operation is safe and idempotent, has no body, writes nothing, and a plain GET is the simplest thing for a browser to fetch with the session cookie.
- **Rejected**: `POST /cvs/:id/export` (nothing is created; implies a side effect), `GET /cvs/:id/result?format=pdf` (mixes a JSON contract with binary), `/cvs/:id/export.pdf` (filename-like suffix, redundant with `Content-Disposition`).

## D-7. Ownership and the "no clarification text" guarantee by construction

- **Decision**: the export service loads the CV with `findFirst({ where: { id, userId, generationStatus: 'COMPLETED' }, select: { id, targetRole, draft } })` after the same `findOwnedOrThrow` gate `getResult` uses (404 foreign or missing, 409 not ready). The query **does not select questions** at all, so no clarification text can reach the template. The draft is parsed again with `cvDraftSchema` (database JSON is an external boundary).
- The renderer receives `{ draft, targetRole }` only: a pure function of its input, with no ownership, HTTP or database knowledge. The template never sees an identifier, revision or status.

## D-8. Download in the browser (cross-origin)

- **Finding**: the web app calls the API cross-origin (`localhost:3000` -> `:3001`, `credentials: 'include'`). A page script can read a response header only if the server lists it in `Access-Control-Expose-Headers`; `Content-Disposition` is not exposed by default. `app.setup.ts` currently sets `methods` but no `exposedHeaders`.
- **Decision**: expose `Content-Disposition` in CORS; the client fetches the PDF as a blob with the cookie, reads the server's filename from the header (fallback `CV.pdf`), and saves it through a temporary object URL and an anchor click, then revokes the URL.
- **Why not a plain link**: an error (404, 409, 401) would navigate the user to a raw JSON page; a fetch lets the UI show a clear message and keep the editor usable.
- **Mobile**: blob + anchor `download` works in current iOS Safari and Android Chrome; on failure the UI shows the standard failure message.

## D-9. The editor's saved-state gate reuses what exists

- The editor already computes `unsaved` and exposes `autosaver.flush()`; "Apply answer" uses the same pattern (`blockedReason`, `flush`). The Download action follows it: flush pending edits, and if the form is invalid, a conflict is unresolved or the flush fails, do not download and say why. No change to the autosaver itself.
- All new logic is a framework-free function (`download-flow.ts`) with the browser APIs injected, so its behavior is unit-tested without a DOM, as `apply-flow.ts` and `delete-flow.ts` are.

## D-10. No schema change, no persistence of PDFs

- Nothing is stored: the PDF is rendered per request and streamed. No migration, no new column, no `updatedAt` write (FR-016). A response of a few tens of KB at the product's maximum draft size does not justify caching, and caching would risk serving a stale draft.

## D-11. Safe filename

- **Decision**: `<Candidate name>-<Target role>.pdf`, normalized: Unicode letters and digits kept, whitespace to `-`, everything else removed (path separators, quotes, control characters, emoji), repeated `-` collapsed, bounded to 80 characters, default `CV.pdf`. The header carries an ASCII `filename` fallback (non-ASCII letters transliterated or dropped) plus an RFC 5987 `filename*=UTF-8''...` so Cyrillic names survive in modern browsers. Pure function with its own unit tests.

## D-12. Font objects are not reusable across documents (found while implementing)

- **Finding (verified)**: after rendering a document that used Cyrillic, the *next* document came out with a corrupted text layer: "Ada" was extracted as `Ad\u0003`, a link as `htt\bs:/...`. The page looks right, but selecting, copying and searching break, and which document is hit depends on what was rendered before it.
- **Cause**: the renderer's loaded font objects keep per-document state. `Font.reset()` does not help (it drops the loaded data but the cached load promise is never re-run, so the next layout crashes with `unitsPerEm` of null) and `Font.clear()` also removes the built-in Helvetica the renderer needs.
- **Decision**: before every render, remove the two font families and register them again (fresh font objects), and render **one document at a time** (a small promise queue in `CvPdfRenderer`), because the font store is process-wide state. A render takes a few hundred milliseconds; queueing is the simplest correct choice at this scale.
- **Guarded by tests**: documents rendered back to back (Cyrillic, Latin, Cyrillic, Latin) and rendered concurrently must read back exactly, with no control characters.

## D-13. Unbreakable blocks must be shorter than a page (found while implementing)

- **Finding (verified)**: `minPresenceAhead` does not guarantee that a section heading is not left alone at the bottom of a page. Wrapping the heading and its first block in a `wrap={false}` group does, **but** the renderer silently drops whatever does not fit when such a group is taller than a page: a 60-skill list lost its tail, and a header with five long links could do the same.
- **Decision**: group a heading only with content whose size is bounded (the first experience head, one education entry, the profile at most 1200 characters, a skills list up to 600 characters). Unbounded content (a longer skills list, the document header) flows normally; the skills heading then only asks for room ahead, which is best effort. Tests assert no heading is the last line of a page and that the maximum-size draft is complete.
- **Long unbreakable tokens**: the chunk length depends on the font size (`text column width / font size` characters, since a glyph is at most about 1 em wide), because a limit that is right for body text overflowed the 32 pt name.
