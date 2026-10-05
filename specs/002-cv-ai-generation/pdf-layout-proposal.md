# PDF recognition follow-up — 6 October 2026

## P0 / P1 implemented

The Anthropic SDK's generated CV schema contained 17 union parameters; the provider rejected it with HTTP 400 (limit 16). `questions.field` is now an optional, non-nullable enum. The prompt asks for omission when no target exists; the mapper persists omission as null. All factual fields remain nullable. A regression inspects the actual SDK-generated JSON Schema, including referenced definitions.

Phone grounding normalizes formatting and compares complete digit groups within a number-like block, allowing line breaks and adjacent employment years. Numbers need at least eight digits. Partial groups, missing country/area prefixes, year-only sequences, labelled unrelated numbers and blank-line-separated blocks remain unsupported. Other contact and organisation checks are unchanged.

## P2 proposed algorithm, not enabled

The installed `unpdf.extractTextItems` exposes `str`, `x`, `y`, `width`, `height`, `fontSize`, `dir`, and `hasEOL`. No library switch is needed for a controlled prototype:

1. Process pages separately; retain their boundaries.
2. Group spans by baseline (the prototype uses a 2-point tolerance), then order spans horizontally.
3. Detect a persistent large gutter on at least three rows, rather than treating a single right-aligned date as a second column.
4. Read each column top to bottom, left column first; retain line boundaries and infer spaces only from measured gaps.
5. Flag overlapping spans. Do not silently guess a missing character position inside a larger text span.

`test/helpers/pdf-layout-prototype.ts` is test-only and is never called by `PdfTextExtractor`. Four controlled tests show unchanged normal single-column text, improved two-column/sidebar ordering, and improved mixed-script DOCX bullet order.

The DOCX fixture still contains an apostrophe span overlapping a larger qualification span. Simple sorting cannot place it faithfully inside that span. Full-width headers/footers, rotated text, right-to-left text and broader real-world exports also remain unverified. **P2 is not ready for production**; the current extractor remains enabled. Resolve overlap handling and broaden those cases before rollout.

Image-only PDFs remain a safe ingestion failure. No OCR or production CV-content logging was added.
