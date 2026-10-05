# Feature Specification: CV Input and AI Generation Lifecycle

**Feature Branch**: `002-cv-ai-generation`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Allow an authenticated user to create a CV generation request from either an uploaded PDF CV or free-text background information, plus a target role, then generate and persist a structured CV draft using Anthropic, with a reliable, reload-safe generation lifecycle, clarification questions for missing information, validated AI output and anti-hallucination behavior."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a CV from free text (Priority: P1)

A signed-in user pastes their background (experience, education, skills) as free text, states the role they are targeting, and submits. The request is saved immediately and generation starts without the user having to wait on the page.

**Why this priority**: This is the simplest complete path from input to a generated CV and carries the whole lifecycle. Everything else extends it.

**Independent Test**: As a signed-in user, submit free text and a target role; receive an immediate confirmation that a CV exists in a waiting state, then observe it reach a final state.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they submit free text and a target role, **Then** a new CV owned by them is created in the waiting (`PENDING`) state and the response returns before generation finishes.
2. **Given** a signed-in user, **When** they submit free text without a target role, **Then** the request is rejected with a clear message and nothing is created.
3. **Given** a signed-in user, **When** they submit a blank, whitespace-only or too-short text, or text over the maximum length, **Then** the request is rejected with a clear message and nothing is created.
4. **Given** a signed-in user, **When** they submit a request that contains both free text and a PDF, or neither, **Then** the request is rejected with a clear message that exactly one source is required, and nothing is created.
5. **Given** a visitor who is not signed in, **When** they submit a generation request, **Then** it is refused as unauthenticated.

---

### User Story 2 - Start a CV from an uploaded PDF (Priority: P1)

A signed-in user uploads their existing CV as a PDF, states a target role, and submits. Only the text of the PDF is used.

**Why this priority**: Uploading an existing CV is one of the two required entry points of the product.

**Independent Test**: Upload a valid text-based PDF with a target role and see a new CV created; upload a non-PDF, an oversized file, and a PDF with no readable text, and see each handled in a controlled, explained way.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they upload a valid PDF and a target role, **Then** a new CV is created in the waiting state and the response returns before generation finishes.
2. **Given** a signed-in user, **When** they upload a file that is not a PDF (including a file renamed to `.pdf`), **Then** the request is rejected with a clear message and nothing is created.
3. **Given** a signed-in user, **When** they upload a PDF larger than the size limit, **Then** the request is rejected with a clear message and nothing is created.
4. **Given** a file that is accepted as a PDF (it has the PDF signature and is within the size limit) with a target role, **When** its text cannot be parsed or yields no usable text (for example a corrupt, password-protected, scanned image-only or empty PDF, or text above the maximum length), **Then** the request is rejected with a clear, safe extraction-failure message (a distinct error from a validation error) and nothing is created: no CV, no generation. This is an input failure, not a generation failure. No text-recognition (OCR) is attempted.
5. **Given** a signed-in user, **When** they upload a PDF without a target role, **Then** the request is rejected and nothing is created.

---

### User Story 3 - Generation survives reload and never hangs (Priority: P1)

Generation takes time. The user can close the page, reload it or come back later and always see the true, persisted state of their CV: waiting, processing, completed or failed. A generation never stays "processing" forever.

**Why this priority**: Reload-safe progress and explicit failure are core reliability requirements of the product.

**Independent Test**: Start a generation, reload at each stage and confirm the page reports the stored state; simulate a failure and an interruption and confirm the CV ends in `FAILED`.

**Acceptance Scenarios**:

1. **Given** a CV in `PENDING` or `PROCESSING`, **When** the user reloads the page or opens it from another device, **Then** the same state is shown and no work is lost or restarted unnecessarily.
2. **Given** a running generation, **When** the original request has already returned (or the browser tab is closed), **Then** the generation still runs to a final state.
3. **Given** a generation that succeeds, **When** it finishes, **Then** the CV moves to `COMPLETED` and the draft is stored.
4. **Given** a generation that fails for any reason (AI provider error, invalid AI output, time limit, interruption), **When** it ends, **Then** the CV moves to `FAILED` with a safe, understandable reason.
5. **Given** a generation that was `PROCESSING` when the server restarted, **When** the server starts again, **Then** the CV is marked `FAILED` with a safe "interrupted" reason, because its in-flight AI request was lost with the process; it is never silently resumed and never remains `PROCESSING` indefinitely. The user can retry it explicitly. A CV that was still `PENDING` is simply picked up and processed.
6. **Given** a CV in `FAILED`, **When** the user chooses to retry, **Then** generation runs again on the stored source and the CV returns to `PENDING`; a CV that is not `FAILED` cannot be retried.

---

### User Story 4 - Receive a structured draft and clarification questions (Priority: P1)

When generation completes, the user gets a structured CV draft built only from what they provided, plus questions for anything missing, vague or contradictory. The model never fills gaps with invented facts.

**Why this priority**: This is the product's central value and the anti-hallucination guarantee required by the constitution.

**Independent Test**: With a mocked AI, generate from a source that lacks some information and verify the draft leaves it empty and a persisted clarification question asks for it; verify malformed AI output is never stored as a valid draft.

**Acceptance Scenarios**:

1. **Given** a successful generation, **When** it completes, **Then** a draft containing contact details, a professional summary, experience, education and skills is stored, with descriptions rephrased as concise professional bullet points.
2. **Given** a target role, **When** the draft is produced, **Then** the summary is relevant to that role and the most relevant experience is placed first.
3. **Given** source text that lacks a fact (for example no employment dates or no contact email), **When** the draft is produced, **Then** that field is left empty and a clarification question is stored for it; no value is invented.
4. **Given** source text that is vague or contradictory, **When** the draft is produced, **Then** a clarification question is stored identifying the affected section and what is unclear.
5. **Given** the AI returns both a partial draft and clarification questions, **When** it is validated, **Then** both are stored and the CV is `COMPLETED`.
6. **Given** the AI output is malformed or fails validation, **When** it is checked, **Then** nothing from it is stored as valid CV data, at most one automatic retry is made, and if it still fails the CV is `FAILED`.
7. **Given** a draft whose contact detail is not supported by the source, or whose employer or school has no recognisable counterpart in the source (for example an organisation that appears nowhere in it), **When** it is checked, **Then** the draft is rejected as invalid (treated like malformed output). A name that is merely reformatted, for example different capitalisation, punctuation, a legal suffix or an abbreviation, is accepted.
8. **Given** source text containing instructions aimed at the AI (for example "ignore previous instructions and ..."), **When** generation runs, **Then** the text is passed as data only and its instructions are not followed.

---

### User Story 5 - Only the owner can see a generation (Priority: P1)

Status, draft and clarification questions are private to the user who created the CV. Another user's request is indistinguishable from a request for a CV that does not exist.

**Why this priority**: Ownership is a critical security boundary of the product.

**Independent Test**: User A creates a CV; User B requests A's status, draft and questions and receives the same response as for a CV id that does not exist.

**Acceptance Scenarios**:

1. **Given** User A's CV, **When** User B requests its status, draft, questions or a retry, **Then** the response is identical to the response for a non-existent CV and reveals nothing about it.
2. **Given** a request that includes a `userId` anywhere, **When** it is processed, **Then** that value has no effect on identity or ownership.
3. **Given** no valid session, **When** any generation operation is requested, **Then** it is refused as unauthenticated.

---

### User Story 6 - Minimal screens that show the lifecycle (Priority: P2)

A simple, mobile-friendly flow lets the user choose their input mode, enter the target role, submit, watch progress, and see the result or the failure.

**Why this priority**: The behavior works through the API, but a person must be able to demonstrate and use the lifecycle. It adds no new rules.

**Independent Test**: At phone width, create a CV from free text and from a PDF, reload during processing, and reach completed and failed screens.

**Acceptance Scenarios**:

1. **Given** the creation screen, **When** the user picks "free text" or "PDF", **Then** only the relevant input is shown, alongside the target role field.
2. **Given** invalid input, **When** the form is submitted, **Then** each problem is explained next to the relevant field, in plain language.
3. **Given** a CV that is `PENDING` or `PROCESSING`, **When** the page is shown, **Then** it shows a clear in-progress state, stays responsive, and updates by itself when the state changes, without the user having to reload.
4. **Given** a `COMPLETED` CV, **When** the page is shown, **Then** it displays the structured draft (contact, summary, experience, education, skills) and any clarification questions in a simple, readable layout.
5. **Given** a `FAILED` CV, **When** the page is shown, **Then** it explains the failure safely and offers a way to recover: retry the generation, or start a new CV.
6. **Given** a phone-width viewport, **When** any of these screens is used, **Then** it works without horizontal scrolling.
7. **Given** any state, **When** the user reloads the page, **Then** the same state is shown.

---

### Edge Cases

- Both a PDF and free text are provided in one request: rejected as a validation error (exactly one source is allowed).
- Neither a PDF nor free text is provided.
- A target role that is empty, blank, or longer than the maximum length.
- A file that is not a PDF but has a `.pdf` extension or a PDF content type.
- A corrupt, encrypted/password-protected or image-only PDF, or a PDF whose extracted text is empty, only whitespace, below the minimum usable length, or longer than the maximum: rejected as an extraction failure, nothing created.
- Free text longer than the maximum length.
- A source written mostly in a language other than the one the draft is produced in (see Assumptions).
- Source text that contains instructions directed at the AI.
- The AI provider is slow, unreachable, rate-limited or returns an error.
- The AI provider credentials are missing or invalid: the CV ends `FAILED` with a safe reason and no secret is exposed.
- The AI returns text that is not the required structure, a structure with wrong types or missing sections, or an overlong list.
- The AI returns a draft that includes facts not present in the source.
- The server restarts while a generation is `PROCESSING` (it becomes `FAILED`, interrupted) or `PENDING` (it is picked up).
- The user reloads or opens the page on another device mid-generation.
- The user retries a CV that is not `FAILED`, or retries twice in quick succession: only one generation runs at a time for a CV.
- Two generations are started at once by the same user: each is its own CV and they do not interfere.
- A CV id that is malformed, missing, or belongs to another user.
- A user requests the draft or questions before the CV is `COMPLETED`.

## Requirements *(mandatory)*

### Functional Requirements

#### Input

- **FR-001**: A signed-in user MUST be able to start a CV generation by providing free text and a target role.
- **FR-002**: A signed-in user MUST be able to start a CV generation by uploading a PDF and providing a target role.
- **FR-003**: A request MUST supply exactly one source: either free text or a PDF. A request that supplies both MUST be rejected with a validation error and MUST NOT create a CV. The two sources are never combined.
- **FR-004**: A request with neither a PDF nor free text MUST be rejected with a clear message (exactly one source is required) and MUST NOT create a CV.
- **FR-005**: A request without a target role, or with a blank or over-long target role, MUST be rejected with a clear message and MUST NOT create a CV. The target role is trimmed and has a maximum length (see Assumptions).
- **FR-006**: Free text MUST be rejected when blank, shorter than the minimum, or longer than the maximum (see Assumptions).
- **FR-007**: All input MUST be validated at runtime before it reaches business logic; invalid input MUST never create a CV or start a generation.

#### PDF handling

- **FR-008**: Only PDF files MUST be accepted. The file type MUST be verified from the file's actual content, not from its name or declared type alone, and the file size MUST be limited (see Assumptions). Anything else MUST be rejected with a clear message.
- **FR-009**: Text MUST be extracted from the PDF and used as the source for generation. Screenshots or page images of the PDF MUST NOT be used.
- **FR-010**: Extracted text is untrusted input and MUST be handled exactly like free text.
- **FR-011**: A file that is accepted as a PDF but whose text cannot be parsed or yields unusable text (corrupt, password-protected, empty, below the minimum usable length, or above the maximum length) MUST be rejected with a distinct, safe extraction-failure error (HTTP 422, code `PDF_EXTRACTION_FAILED`) and MUST NOT create a CV or a generation. This is an input failure, separate from validation errors (wrong type, oversize, bad request: HTTP 400, code `VALIDATION_ERROR`, nothing created) and from generation failures. No text recognition (OCR) is performed.
- **FR-012**: The uploaded file MUST NOT be sent to external file storage. The original PDF file is not retained; only its extracted text is kept as the source (see Assumptions).

#### Persistent lifecycle

- **FR-013**: Every generation MUST have an explicit, persisted state: `PENDING`, `PROCESSING`, `COMPLETED` or `FAILED`.
- **FR-014**: The request MUST be saved (CV and source persisted in `PENDING`) before any AI work begins, and the response to the user MUST return without waiting for the AI.
- **FR-015**: Generation MUST run independently of the original request and of the browser tab; it MUST continue if the user closes or reloads the page.
- **FR-016**: Reloading the page, or opening it from another device, MUST show the persisted state and MUST NOT lose or silently restart progress.
- **FR-017**: A generation MUST end only as `COMPLETED` or `FAILED`. A generation MUST NOT remain `PROCESSING` indefinitely: it MUST reach a final state within a maximum duration (see Assumptions). When the server starts, every generation found `PROCESSING` MUST be marked `FAILED` with a safe "interrupted" reason (its in-flight AI request was lost with the process); `PENDING` generations are processed normally. Work MUST NOT be silently resumed, and a stale or duplicate worker MUST NOT be able to change a terminal state.
- **FR-018**: A failed generation MUST record a safe, categorised failure reason (for example AI provider problem, invalid AI output, timed out, interrupted) that can be shown to the user. It MUST NOT expose provider errors, internal details, secrets or the source text.
- **FR-019**: A `COMPLETED` generation MUST have its structured draft persisted. A generation that is not `COMPLETED` MUST NOT expose a draft.
- **FR-020**: Only one generation MAY run at a time for a given CV. A user MAY retry a `FAILED` generation, which re-runs it on the stored source and returns the CV to `PENDING`. Retrying a CV in any other state MUST be refused.
- **FR-021**: The state of a generation belongs to the owning user's CV and MUST be readable only by that user.

#### AI generation

- **FR-022**: All AI calls MUST use Anthropic as the only provider. The provider credential MUST come from configuration and MUST NOT be committed or exposed.
- **FR-023**: The input to the AI MUST consist only of the source text and the target role, framed by the system's own instructions.
- **FR-024**: The AI output MUST be a structured draft that supports contact details, a professional summary, experience, education and skills.
- **FR-025**: The draft MUST rephrase and restructure the supplied facts, express descriptions as concise professional bullet points, and make the summary relevant to the target role. The most relevant experience SHOULD be placed first. Re-ordering and re-wording are the only permitted ways to apply the target role.
- **FR-026**: The draft MUST NOT contain facts that are not supported by the source. In particular it MUST NOT invent employers, job titles, dates, technologies, responsibilities, metrics, education, certifications, contact details, team sizes or any other unsupported claim.
- **FR-027**: A field the source does not support MUST be left empty rather than filled.

#### Clarification questions

- **FR-028**: When information is missing, vague, contradictory or insufficient, the system MUST create a clarification question instead of inventing the fact.
- **FR-029**: Each clarification question MUST be persisted with the CV and MUST identify: the CV section it relates to (contact, summary, experience, education or skills), the specific entry when applicable, what is missing or ambiguous, and the question text shown to the user.
- **FR-030**: A generation MAY produce both a partial draft and clarification questions. Both MUST be persisted, and the CV is `COMPLETED`. Open questions do not make the generation fail.
- **FR-031**: Answering clarification questions, and applying answers to the draft, is out of scope here. Questions are stored in a form that a later feature can consume.

#### Validation of AI output

- **FR-032**: AI output is untrusted. Before anything is stored it MUST pass through, in order: structured parsing, runtime schema validation, then domain validation. Nothing from an output that fails any step MAY be stored as valid CV data.
- **FR-033**: Domain validation MUST enforce the structural invariants of a draft: every required section is present (possibly empty), size bounds are respected, no entry is empty, clarification questions refer to a valid section and, when they name an entry, to an entry that exists, and the question cap is respected. Beyond structure, it applies source-backed checks where they are practical and reliable:
  - **Contact details** (email, phone, links) are checked more strictly: each one in the draft MUST be supported by the source after ignoring formatting differences (case, spacing, punctuation, phone-number formatting). A contact detail the source does not contain is rejected.
  - **Employer and institution names** MUST be supported by the source, but support is NOT defined as exact string containment, because the AI may legitimately normalise, abbreviate or reformat names. A name with no recognisable counterpart in the source is rejected; a name that is only reformatted is accepted. How closely a name must match is decided in planning, provided it satisfies these two examples.
  - The system does NOT attempt to mechanically prove that every generated bullet, date or description is true. Those are controlled by the generation instructions and by clarification questions for anything missing or ambiguous.
- **FR-034**: When AI output fails validation, the system MAY retry the AI call at most once automatically. If the second attempt also fails, the generation MUST end `FAILED` with a safe reason. Retries MUST NEVER be unbounded.
- **FR-035**: Unsafe type assertions MUST NOT be used to force AI output into application types.
- **FR-036**: A failed or invalid AI output MUST NOT modify any previously stored valid draft.

#### Untrusted source text

- **FR-037**: Source text (free text and extracted PDF text) MUST be treated as data, never as instructions. The system's instructions and the user-provided content MUST be clearly separated in what is sent to the AI.
- **FR-038**: The AI instructions MUST state that any instructions found inside the source content are to be ignored when they conflict with the generation rules. No further content-security system is required.

#### Access and ownership

- **FR-039**: Every operation in this feature MUST require a valid session and MUST derive identity from it. A client-supplied `userId` MUST never affect identity or ownership.
- **FR-040**: A request for another user's CV MUST be indistinguishable from a request for a CV that does not exist, for status, draft, questions and retry alike.

#### Behavior of operations

The operations below define required outcomes. Route names and payload field names are decided in planning.

| Operation | Behavior |
|-----------|----------|
| Start generation (free text) | Validates input, creates the CV with the source, returns promptly with the CV id and state `PENDING` (accepted, not completed). Invalid input is rejected with validation errors and nothing is created. |
| Start generation (PDF) | As above, accepting a PDF upload. A wrong type, oversize file or malformed request is rejected with validation errors; a file accepted as a PDF whose text cannot be parsed or is unusable is rejected with a distinct extraction-failure error (HTTP 422, `PDF_EXTRACTION_FAILED`). In both cases nothing is created. |
| Get status | Returns the CV's state, safe failure reason when `FAILED`, and timestamps. Always available to the owner. |
| Get result | Returns the persisted structured draft together with its persisted clarification questions (possibly none) when the CV is `COMPLETED`; otherwise a clear "not ready" outcome. One operation serves both. |
| Retry | Allowed only for the owner's `FAILED` CV; returns promptly with state `PENDING`; refused otherwise. |

All operations use the existing error behavior: unauthenticated requests are refused, a missing or foreign CV yields the standard "not found" outcome, invalid input yields validation errors with field details, and no outcome reveals stack traces, provider messages or secrets.

#### Screens

- **FR-041**: The product MUST provide a screen to create a CV: choose free text or PDF, enter the target role, and submit, with clear field-level errors.
- **FR-042**: The product MUST provide a CV page that shows the persisted state: in progress (`PENDING`/`PROCESSING`), completed (structured draft and any clarification questions), or failed (safe reason plus a retry action). It MUST update by itself while a generation is in progress, MUST NOT freeze or poll aggressively, MUST stop updating when a final state is reached, and MUST show the same state after a reload.
- **FR-043**: The screens MUST be usable on mobile (no horizontal scrolling at 320 px width). A simple read-only structured view of the draft is sufficient; the rich document editor is out of scope.

### Key Entities *(include if feature involves data)*

- **CV**: The existing user-owned record. In this feature it also carries the target role and the state of its generation, and is where the draft and questions belong. It always has exactly one owner.
- **Generation**: The current attempt to turn a source into a draft. Has a state (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`), a safe failure reason when failed, the input mode (free text or PDF), timestamps, and a count of how many times processing started (for diagnosis).
- **Source**: The text a draft is generated from: the free text, or the text extracted from the uploaded PDF. Untrusted. The original PDF file is not kept.
- **Draft**: The validated structured CV: contact details, professional summary, experience entries (employer, title, dates, bullet points), education entries (institution, qualification, dates) and skills. Any field the source does not support is empty.
- **Clarification question**: A persisted question tied to a CV: the section (and entry) it concerns, what is missing or ambiguous, and the question text. Not answered in this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After submitting valid input, the user sees their CV in an in-progress state within 3 seconds, and the page stays fully responsive while generation runs.
- **SC-002**: 100% of generations reach `COMPLETED` or `FAILED` within the maximum duration; none remains `PROCESSING` indefinitely, including after a server restart.
- **SC-003**: In 100% of tested reloads, at any stage, the page shows the persisted state of the CV.
- **SC-004**: 0 AI outputs that fail structural or domain validation are stored as valid CV data, across all tested malformed, incomplete and unsupported outputs.
- **SC-005**: 100% of tested requests with invalid input (no source, both sources, missing target role, unsupported or oversized file, blank or too-short text) are rejected with a clear message, and 100% of tested PDFs whose text cannot be used are rejected with the extraction-failure error; none of them creates a CV.
- **SC-006**: In every tested case where the source lacks a fact, the draft leaves it empty and a clarification question is stored for it; 0 invented values.
- **SC-007**: 0 cases in tests where one user can read, or detect the existence of, another user's status, draft or questions.
- **SC-008**: Every AI request in the product goes to Anthropic; the automated test suite makes 0 real AI requests and passes with no AI credential configured.
- **SC-009**: The creation, progress, completed and failed screens work at a 320 px viewport with no horizontal scrolling.
- **SC-010**: The automated tests listed under Required Automated Test Coverage exist and pass.

## Required Automated Test Coverage

Tests MUST verify observable behavior, MUST NOT depend on execution order, and MUST NOT call the real AI provider. The AI provider is replaced by a controllable test double. Truthfulness of the model is not tested; the contracts around it are.

- **Input validation**: free text plus target role accepted; PDF plus target role accepted; neither source rejected; both sources in one request rejected; missing, blank and over-long target role rejected; blank, too-short and over-long free text rejected; non-PDF, renamed non-PDF and oversized files rejected.
- **PDF**: text extraction succeeds on a valid text PDF; a file accepted as a PDF whose text cannot be used (corrupt, password-protected, image-only, empty-text, or over-long text) is rejected with the extraction-failure error and creates no CV and no generation; a file that is not a PDF is a validation error.
- **Lifecycle**: creation persists `PENDING` before AI work; `PENDING` -> `PROCESSING` -> `COMPLETED` with the draft stored; failure -> `FAILED` with a safe reason; the status read after a simulated reload observes the persisted state; a generation found `PROCESSING` at startup becomes `FAILED` (interrupted) and a `PENDING` one is processed; a `PROCESSING` generation past the time limit becomes `FAILED`; a result arriving after a terminal state cannot change it; retry works only for `FAILED` and never runs two generations at once.
- **AI output**: valid structured output accepted and stored; malformed, wrongly-typed and incomplete output rejected; a draft with a contact detail not supported by the source rejected; a draft naming an employer or institution with no counterpart in the source rejected, while a draft that only reformats a name (capitalisation, punctuation, legal suffix) is accepted; the single bounded retry succeeds or leads to `FAILED`; invalid output never changes stored CV data; clarification questions persisted with their section and text; a partial draft plus questions stored together.
- **Untrusted source**: the prompt sent to the AI keeps source content in a clearly separated data section and states that embedded instructions are not to be followed (tested on the constructed request, not on model behavior).
- **Ownership**: another user's status, draft, questions and retry are indistinguishable from a non-existent CV; a client `userId` is ignored; unauthenticated requests are refused.
- **Provider configuration**: a missing or failing AI provider ends the CV `FAILED` with a safe reason and leaks no secret.

## Acceptance Criteria

- **AC-001**: A signed-in user can start generation from free text plus a target role and immediately receives a CV in `PENDING`.
- **AC-002**: A signed-in user can start generation from a valid PDF plus a target role and immediately receives a CV in `PENDING`.
- **AC-003**: Requests with neither source, both sources, a missing target role, blank or too-short text, a non-PDF file, or an oversized file are rejected with validation errors and create nothing.
- **AC-004**: The generation state is persisted and a fresh read after a reload returns the same state.
- **AC-005**: A successful generation moves `PENDING` -> `PROCESSING` -> `COMPLETED` and persists a structured draft with contact details, summary, experience, education and skills.
- **AC-006**: A failed generation ends explicitly `FAILED` with a safe reason; no generation remains `PROCESSING` indefinitely, and a generation found `PROCESSING` at server start becomes `FAILED` (interrupted) and can be retried.
- **AC-007**: Malformed or invalid AI output (including a contact detail the source does not support, or an employer or institution with no counterpart in the source) is never stored as valid CV data; at most one automatic retry occurs before `FAILED`.
- **AC-008**: Missing, vague or contradictory facts produce persisted clarification questions (with section, what is missing, and question text) and are never filled with invented values; a partial draft plus questions is a valid `COMPLETED` result.
- **AC-009**: A file accepted as a PDF whose text cannot be parsed or is unusable is rejected with the extraction-failure error, creates no CV and no generation, and no OCR is attempted.
- **AC-010**: Source text containing instructions to the AI is sent as separated data with an explicit instruction to ignore embedded instructions.
- **AC-011**: A user cannot read, retry or detect another user's generation, draft or questions; the response equals that for a non-existent CV.
- **AC-012**: All AI calls use Anthropic, and the automated tests make no real Anthropic request.
- **AC-013**: The create, in-progress, completed and failed screens work at phone width, update by themselves during processing and show the same state after a reload.

## Assumptions

- **Foundation**: Authentication, sessions and CV ownership from the previous feature are reused as they are; their rules (including the identical "not found" response for foreign CVs) apply unchanged.
- **One generation per CV; new CV per start**: Starting a generation creates a new CV owned by the user. A CV has one current generation; retry re-runs it on the stored source and replaces a failed attempt. The placeholder "create CV" operation from the previous feature evolves into the start-generation operation: every CV has a source and a lifecycle, the empty-CV behavior is not preserved (there is no public compatibility requirement yet), and the existing ownership tests move to the new request shape.
- **Input limits**: Free text: at least 50 and at most 20,000 characters after trimming. Target role: 1 to 200 characters after trimming. PDF: at most 5 MB. A source (free text or extracted PDF text) shorter than 50 usable characters is unusable; longer than 20,000 characters is rejected as a validation error for free text and as an extraction failure for extracted PDF text. These defaults can be tuned in planning.
- **PDF retention and privacy**: The original PDF is read once and not kept; the extracted source text is persisted with the CV so that retry and later features can use it. The source content is sent to the AI provider as part of generation; this is inherent to the product.
- **Time bound**: A generation must reach a final state within 5 minutes; anything still `PROCESSING` after that is marked `FAILED`. A generation found `PROCESSING` when the server starts is marked `FAILED` (interrupted) at once, not resumed. This default can be tuned in planning.
- **Retries**: At most one automatic retry of the AI call per generation attempt, for invalid output or a transient provider error. Manual retries of a `FAILED` generation are allowed one at a time.
- **Draft language**: The draft is written in English; source content in another language is not translated or rejected, and its facts are carried over as written. Multi-language support is out of scope.
- **Dates as given; limits of mechanical checking**: Dates are kept as written in the source (no normalisation, no estimation). Source-backed checks are limited to what can be verified reliably: contact details strictly, employer and institution names by support rather than exact text (FR-033). Everything else, including individual bullets and dates, is controlled by the generation instructions and by clarification questions; truthfulness is not mechanically proven.
- **Question cap**: A generation stores at most 10 clarification questions, and each is answered in a later feature.
- **Screens**: A creation screen and a single CV page that reflects the state are included. A list of the user's CVs, editing, and answering questions are not part of this feature.
- **Provider configuration**: The Anthropic credential comes from environment configuration. If it is missing or invalid, generations end `FAILED` with a safe reason; the application itself still starts.
- **Constraints inherited, not restated**: Technology, architecture, strict typing, testing and data-integrity rules come from the project constitution and `.claude/rules/`. They are intentionally not repeated or decided here, including the choice of background mechanism, PDF library, model and prompt wording.

### Out of Scope

The final document-first CV editor, manual editing of CV fields, answering or applying clarification questions, PDF export, multiple templates, job-description tailoring, text recognition (OCR) for scanned PDFs, translation, file storage services, OAuth, password reset, email verification, payments, admin tooling, Redis, message brokers, microservices and distributed queues.
