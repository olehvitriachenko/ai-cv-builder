# Feature Specification: CV PDF Export

**Feature Branch**: `004-pdf-export`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Add production-quality PDF export for the current persisted CV draft: A4, selectable text, one template, owner-only, safe filename, long content handled, Download PDF enabled in the editor with loading and failure states."

## Context

The product contract requires that a signed-in user can **export the final CV as an A4 PDF with selectable text** (constitution, Principle I). Features 001 to 003 delivered accounts, CV ownership, generation, clarification questions, the editor and My CVs. The "Download PDF" action already exists in the editor header and on every My CVs card, but it is disabled with the hint "PDF export is coming soon". This feature makes it work.

This feature builds on the persisted CV draft defined in `specs/002-cv-ai-generation/data-model.md` and the editing and clarification rules in `specs/003-cv-editor-my-cvs/`. It does not change them.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Download my CV as a PDF from the editor (Priority: P1)

A signed-in user who has reviewed and edited a CV clicks **Download PDF** in the editor and receives an A4 PDF of the CV exactly as it is saved, ready to attach to a job application.

**Why this priority**: This is the end of the product's core flow ("Add information, Review and edit, Export PDF") and a hard requirement of the product contract. Without it the product produces nothing the user can send to an employer.

**Independent Test**: Open a completed CV in the editor, change the summary, click Download PDF, and open the file: it is A4, its text can be selected and searched, and it contains the changed summary.

**Acceptance Scenarios**:

1. **Given** a completed CV with a saved draft, **When** the owner clicks Download PDF, **Then** a PDF file is downloaded containing the contact details, target role, summary, experience, education and skills of the saved draft.
2. **Given** the owner has just typed an edit and it has not been saved yet, **When** they click Download PDF, **Then** the edit is saved first and the downloaded PDF contains it, or, if it cannot be saved, the download does not start and the owner is told why.
3. **Given** a download is being prepared, **When** the owner looks at the action, **Then** it shows that the PDF is being prepared and cannot be triggered a second time until it finishes.
4. **Given** the PDF could not be produced (server or network failure), **When** the attempt ends, **Then** the owner sees a clear message, the editor and the unsaved state are unaffected, and they can try again.
5. **Given** a clarification question has been answered but not applied, **When** the owner downloads the PDF, **Then** the answer text does not appear in the PDF; **and** given an answer that was applied, **Then** its effect on the CV appears normally because it is part of the draft.
6. **Given** a CV that still has open clarification questions, **When** the owner downloads the PDF, **Then** the PDF is produced from the draft as it is, without question text and without placeholders for missing facts.

---

### User Story 2 - Only the owner can export, and only a finished CV (Priority: P1)

Another user, an anonymous visitor or a request for a CV that is not ready must never receive a PDF.

**Why this priority**: A CV contains personal data. Ownership is a critical security boundary of the product, and an export is the most portable copy of that data.

**Independent Test**: As user B request the export of user A's CV, and of a CV id that does not exist: both answers are identical "not found". Request the export of a CV that is still generating or has failed: refused, nothing is produced.

**Acceptance Scenarios**:

1. **Given** user A's CV, **When** user B requests its export, **Then** the answer is the same "CV not found" as for a CV that does not exist, and no PDF content or filename is revealed.
2. **Given** a signed-out visitor, **When** they request any export, **Then** they are asked to sign in and nothing is produced.
3. **Given** a CV that is still being generated, or whose generation failed, **When** its owner requests the export, **Then** the request is refused with the same "not ready" outcome the result view already uses, because no draft exists.
4. **Given** a malformed CV identifier, **When** the export is requested, **Then** the request is rejected as invalid input.
5. **Given** a user id supplied by the client in any part of the request, **When** the export is requested, **Then** it is ignored; the signed-in identity decides.

---

### User Story 3 - The PDF is readable for any CV, short or long (Priority: P1)

Whatever the draft contains (a nearly empty draft, a typical one-page CV or a CV at the maximum size the product allows), the PDF is complete, readable and never clips or overlaps text.

**Why this priority**: A PDF that cuts off a bullet or leaves a heading alone at the bottom of a page is not production quality, and a CV is judged on its look.

**Independent Test**: Export a draft with only a target role, a typical draft, a draft with every list at its maximum length, and a draft with very long unbroken text (a URL, a long word): all produce valid A4 PDFs where every piece of text of the draft is present and inside the page margins.

**Acceptance Scenarios**:

1. **Given** a draft with no facts at all (no name, no summary, empty lists), **When** it is exported, **Then** a valid one-page A4 document is produced showing the target role and nothing invented.
2. **Given** a draft with missing optional facts (no email, no dates, no employer location), **When** it is exported, **Then** the missing facts are simply left out, with no placeholder text and no stray separators.
3. **Given** a draft whose content does not fit one page, **When** it is exported, **Then** the content continues on following A4 pages with consistent margins, no text is cut off, and a section heading is never left alone at the bottom of a page.
4. **Given** an experience entry, **When** a page ends inside it, **Then** its title line is never separated from the first line of its details.
5. **Given** a very long unbroken value (for example a long link), **When** it is exported, **Then** it stays within the page margins and remains fully present.
6. **Given** names and text containing accents or Cyrillic letters, **When** exported, **Then** every character is rendered correctly and remains selectable.
7. **Given** the maximum amounts the product allows (30 experience entries with 12 bullets each, 10 education entries, 60 skills), **When** exported, **Then** the export succeeds.

---

### User Story 4 - Download from My CVs without opening the editor (Priority: P2)

From the My CVs list, the owner downloads the PDF of a CV that has a draft, using the Download PDF action already shown on every card.

**Why this priority**: A convenience on top of the editor action. The card action already exists in the approved design; it only needs to work, and it must be clear when it cannot.

**Independent Test**: On My CVs, a card whose CV has a draft downloads its PDF; a card whose CV is generating or failed has the action disabled.

**Acceptance Scenarios**:

1. **Given** a My CVs card of a CV that has a draft (display status Draft or Completed), **When** the owner clicks Download PDF, **Then** the PDF of that CV is downloaded and the card shows the same preparing and failure behavior as the editor.
2. **Given** a card of a CV that is generating or failed, **When** the owner looks at the action, **Then** it is disabled and says why, and no request is made.
3. **Given** the list or the cards, **When** the action becomes enabled, **Then** the layout and design of My CVs do not change.

---

### Edge Cases

- The CV is deleted, or finishes regenerating into a non-completed state, between opening the editor and clicking Download PDF: the owner gets a clear "no longer available" or "not ready" message, not a broken file.
- The owner's session expired: they are taken to sign in; nothing is downloaded.
- Two quick clicks on Download PDF: one download only.
- The editor has fields that currently fail validation: the download is withheld with the same instruction the editor already gives ("fix the highlighted fields"), because the saved draft is not the on-screen content.
- A save conflict (the CV changed elsewhere) is unresolved: the download is withheld until the owner resolves it, so the PDF never silently reflects the wrong version.
- Candidate name or target role contains characters that are unsafe or invalid in file names (slashes, quotes, control characters, emoji, very long text): the file name is still safe and readable.
- The name is missing: the file name falls back to a generic one built from the target role, or a default.
- The draft is edited in another browser tab: the export always reflects the latest saved state at the moment of the request.
- A very large draft makes rendering slow: the owner sees the preparing state until it finishes or fails; the editor stays usable.
- Browser blocks or fails the file save on a phone: the owner is told the download failed and can retry.

## Requirements *(mandatory)*

### Functional Requirements

**Content and format**

- **FR-001**: The system MUST produce a PDF of the latest saved draft of a CV owned by the signed-in user, read at the moment of the request (never from a cached or earlier rendering).
- **FR-002**: The PDF MUST contain exactly the content of the saved draft: target role, contact details (name, location, email, phone, links), professional summary, experience (title, employer, location, dates, bullets), education (qualification, institution, dates, details) and skills.
- **FR-003**: The PDF MUST NOT contain clarification questions, any clarification answer (unanswered, answered-but-not-applied or dismissed), the source text the CV was generated from, or any internal data (identifiers, revision, status, timestamps).
- **FR-004**: Changes from applied clarification answers MUST appear like any other draft content.
- **FR-005**: The PDF MUST be A4, portrait, and all text MUST be real selectable and searchable text, not an image of text.
- **FR-006**: There MUST be exactly one template. The user cannot choose, switch or configure a template. Its look follows the on-screen A4 preview (serif body text, sans-serif headings, thin rules, same section order).
- **FR-007**: Facts the draft does not contain MUST be left out silently: no placeholder wording, no "null", no empty headings, no dangling separators. A section with no content MUST NOT be shown.
- **FR-008**: A draft with no facts MUST still export to a valid one-page document that shows the target role.
- **FR-009**: Text in the character sets the product supports (Latin with accents, Cyrillic) MUST render correctly.

**Layout and pagination**

- **FR-010**: Content longer than one page MUST continue on additional A4 pages with the same margins; no text may be clipped, overlap or fall outside the margins.
- **FR-011**: A section heading MUST NOT be left alone at the bottom of a page, and an entry's title line MUST NOT be separated from the first line of its details.
- **FR-012**: Long unbroken values MUST wrap or break inside the margins and stay fully present.
- **FR-013**: The product's maximum draft size MUST export successfully.

**Access and safety**

- **FR-014**: Only the owner can export. A CV that belongs to someone else and a CV that does not exist MUST produce the identical "not found" outcome. Signed-out requests MUST be refused as unauthenticated. A malformed CV identifier MUST be rejected as invalid input.
- **FR-015**: Only a CV whose generation has completed can be exported. A CV that is pending, processing or failed MUST be refused with the existing "not ready" outcome. Open clarification questions MUST NOT prevent export.
- **FR-016**: Exporting MUST NOT change any stored data: not the draft, its revision, the questions or the CV's last-updated time.
- **FR-017**: The downloaded file MUST have a safe name derived from the candidate name and target role: no path separators, quotes, control characters or characters unsafe in common file systems, a bounded length, a `.pdf` extension, and a default name when nothing usable remains.
- **FR-018**: The response MUST identify itself as a PDF, be delivered as a download, and MUST NOT be cached by browsers or intermediaries.
- **FR-019**: Failures MUST NOT expose internal details (stack traces, database errors, file system paths). Logs of an export MUST carry identifiers, size, duration and outcome only, never CV content.

**Editor (primary action)**

- **FR-020**: The existing Download PDF action in the editor MUST be enabled for a completed CV.
- **FR-021**: Before downloading, unsaved edits MUST be saved so the PDF matches what the owner sees. If they cannot be saved (invalid fields, an unresolved conflict, a save failure), the download MUST NOT start and the owner MUST be told what to do first.
- **FR-022**: While the PDF is being prepared the action MUST show a busy state and MUST ignore further clicks.
- **FR-023**: On failure the owner MUST see a clear, non-technical message near the action and be able to retry; the editor content and save state MUST be unaffected.
- **FR-024**: The editor, its preview and the clarification experience MUST NOT be redesigned or otherwise changed by this feature, except for the Download PDF action itself.

**My CVs (secondary action)**

- **FR-025**: The Download PDF action on a My CVs card MUST be enabled when the CV has a draft (display status Draft or Completed) and disabled, with the reason, when it is generating or failed.
- **FR-026**: Enabling the action MUST NOT change the visual design or layout of My CVs.

**Platform**

- **FR-027**: The download MUST work on desktop browsers and on mobile browsers.

### Key Entities

- **CV Draft (existing)**: The persisted structured CV: contact details, summary, experience, education, skills. The only input of the export. Unchanged by this feature.
- **Exported CV Document (derived)**: A transient A4 PDF produced from one draft and its target role at request time. Never stored by the system; it exists only in the response and then on the user's device.
- **Clarification Question (existing)**: Remains separate from the draft and never contributes to the document.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A typical CV (up to two pages) is ready to save within 5 seconds of the click on a normal connection, and the owner always sees a busy indication while waiting.
- **SC-002**: In 100% of exports, the document is A4 and its text, including the candidate's name and email, can be selected, copied and found by search.
- **SC-003**: In 100% of attempts by a different user, a missing id or a signed-out visitor, no PDF content is returned, and a different user's attempt is indistinguishable from a missing CV.
- **SC-004**: For drafts with missing facts, no exported document contains placeholder wording or an empty section.
- **SC-005**: A draft at the maximum size the product allows exports successfully, with every piece of draft text present and inside the margins on every page.
- **SC-006**: The text of every non-empty draft field appears in the document, in the same order as in the on-screen preview.
- **SC-007**: No answer text from an unapplied clarification question appears in any exported document.
- **SC-008**: When an export fails, the owner can continue editing and retry without reloading the page.

## Assumptions

- "Existing product rules" for what can be exported are those of the editor: only a completed CV has an editable draft; a pending, processing or failed CV has none. A completed CV with open clarification questions is exportable; the PDF is simply the draft as it is.
- The template mirrors the approved on-screen A4 preview; it is not a new design. No page numbers, headers or footers are added.
- The PDF is generated on request and not stored. There is no sharing link, email delivery or history of exports.
- The draft size limits already defined for the product (see feature 002) bound the work of an export; no separate export size limit is introduced.
- Exporting needs no new stored data and no change to the database.
- The file is saved by the user's browser through its normal download mechanism; the system cannot know whether the user then keeps the file.
- Unsaved edits can only be exported after they are saved; the PDF never contains content that the server does not hold.

## Out of Scope

- Multiple templates, themes, fonts or colors chosen by the user.
- Other formats (Word, plain text, images).
- Storing generated PDFs, share links, email delivery, export history or analytics.
- Page numbers, cover pages, photos, watermarks.
- Any change to the editor, its preview, the clarification experience or the My CVs design beyond enabling the existing action.
- Tailoring a CV to a job description, and anything else listed as out of scope in the repository instructions.
