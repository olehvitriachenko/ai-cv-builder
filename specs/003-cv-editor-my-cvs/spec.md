# Feature Specification: CV Editor, Clarifications & My CVs

**Feature Branch**: `003-cv-editor-my-cvs`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Build on the completed `002-cv-ai-generation`. Allow an authenticated user to manage their generated CVs, reopen them later, manually edit a CV, answer clarification questions, apply those answers to the relevant CV section, and persist all changes safely. Includes a My CVs list (`/cvs`), manual editing of the structured CV, clarification answer and apply flow (deterministic where simple, AI-assisted only where wording is required), optimistic concurrency for stale writes, owner-only delete, an owner-scoped list operation, and the editor and My CVs screens from the existing Figma file. PDF export stays disabled (feature 004)."

## Clarifications

### Session 2026-10-05

- Q: How does the user close an answered question whose target was filled in manually or removed? → A: Option C: the user can explicitly **dismiss** the question. Lifecycle is unanswered, answered, applied, dismissed. `applied` means the answer modified the CV; `dismissed` means it was closed without modifying the CV. Both are resolved and do not count toward `openQuestionsCount`. A dismissal persists across reloads and is never automatic.
- Q: Which CVs are manually editable? → A: Only `COMPLETED` CVs. `PENDING` and `PROCESSING` are read-only generation states; `FAILED` has no valid completed draft and is not editable.
- Q: Is every `FAILED` CV retryable? → A: Not assumed. Retry availability is derived by the server from the existing generation-retry rules and reported on each list item; "Try again" is enabled only when the server says the retry is available.
- Q: Where does Download PDF appear? → A: Only where the Figma design shows it (Draft and Completed cards may show it), always disabled, with no fake download behaviour. Export is feature 004.
- Q: How are conflicting saves handled? → A: Autosave with debounced saves, one per-CV revision counter, optimistic concurrency, no automatic merging. A stale save receives a conflict (409) and never overwrites newer persisted data.
- Q: Can a CV be deleted while generating? → A: No. Deleting a `PENDING` or `PROCESSING` CV is refused with a safe conflict response; `COMPLETED` and `FAILED` CVs can be deleted.
- Q: What counts as unresolved for the display status? → A: A question that is `unanswered` or `answered`. `COMPLETED` with one or more unresolved questions shows Draft; with none, Completed.
- Q: Who reads the candidate name? → A: The server. The list exposes `candidateName` (from the draft's contact full name, or empty); the web client never inspects the raw draft to build a card, and the card falls back to `Untitled CV`.
- Q: How is the list ordered and refreshed? → A: Only by last update, newest first, no paging; refreshed about every 5 seconds only while at least one listed CV is `PENDING` or `PROCESSING`.
- Q: What is the authenticated landing page? → A: `/cvs` (My CVs): sign-in and registration redirect there, "My CVs" is the active navigation item, and appropriate "Back to home" links become "Back to My CVs".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See and manage my CVs in one place (Priority: P1)

A signed-in user opens **My CVs** and sees only their own CVs, newest activity first. Each card tells them who the CV is for, which role it targets, when it last changed, where it stands (Processing, Failed, Draft, Completed), a short state message and how many clarification questions are still unresolved. From a card they can open the CV, follow a running generation, retry a failed one when a retry is available, or delete a finished one. My CVs is the first screen they land on after signing in.

**Why this priority**: Without a list the user cannot return to anything they created. It is the entry point to every other story and makes "return later and access persisted CVs" real.

**Independent Test**: With two users each owning CVs in every lifecycle state, sign in as user A and verify the list shows exactly A's CVs, ordered by last update, with the correct display status, name, role, message and open-question count on each card; verify user B's CVs never appear; verify an empty account sees the empty state.

**Acceptance Scenarios**:

1. **Given** a signed-in user who owns several CVs, **When** they open My CVs, **Then** only their own CVs are listed, ordered by last update with the most recent first, and every CV is shown (no paging).
2. **Given** a CV whose generation is `PENDING` or `PROCESSING`, **Then** its card shows the display status **Processing**; **given** `FAILED`, **Failed**; **given** `COMPLETED` with at least one unresolved clarification question (unanswered or answered), **Draft**; **given** `COMPLETED` with none unresolved (every question applied or dismissed, or no questions), **Completed**.
3. **Given** a card, **Then** it shows the candidate name provided by the list (the draft's contact full name), or `Untitled CV` when there is none (for example while still generating or failed), the target role, the last-updated time, the display status, a state message that matches the status, and the number of unresolved clarification questions.
4. **Given** a Processing card, **Then** the primary action is **View progress**, which opens the generation progress view and no delete action is enabled; **given** a Failed card whose retry is available, **Then** the actions are **Try again** and **Delete**; **given** a Failed card whose retry is not available, **Then** no enabled **Try again** is shown, only **Delete**; **given** a Draft or Completed card, **Then** the actions are **Open** and **Delete**, plus the **Download PDF** action as the Figma design shows it, disabled.
5. **Given** at least one listed CV is `PENDING` or `PROCESSING`, **When** the user stays on My CVs, **Then** the list refreshes by itself about every 5 seconds, cards move to their new status without a manual reload, and refreshing stops once no listed CV is active.
6. **Given** a user with no CVs, **When** they open My CVs, **Then** they see the empty state from the Figma design with a way to start a new CV; **and** the privacy note from the Figma design is shown on the list.
7. **Given** a user who signs in or registers, **When** authentication succeeds, **Then** they land on My CVs; **and** screens that previously offered "Back to home" or "Start a new CV" as the way out offer **Back to My CVs** where appropriate.
8. **Given** a visitor who is not signed in, **When** they open My CVs or request the list, **Then** access is refused as unauthenticated.

---

### User Story 2 - Edit my CV by hand and keep the changes (Priority: P1)

A user opens a completed CV and corrects or improves it directly: contact details, professional summary, experience entries (including adding, editing and removing individual bullet points), education and skills. While they type, a live A4-like preview shows the result. Their changes are saved to the server automatically, the editor shows whether it is Saving, Saved or has an Error, and after a reload or on another device the saved CV is exactly what they left.

**Why this priority**: Manual editing is a core product requirement and the user must keep control of the final content. It is also the foundation the clarification flow writes into.

**Independent Test**: Open a completed CV, change one field in each section, add and remove a bullet, reload the page, and verify every change is present; verify an invalid value is rejected with a clear message and nothing is saved; verify the preview reflects edits before they are saved.

**Acceptance Scenarios**:

1. **Given** a `COMPLETED` CV owned by the user, **When** they open it, **Then** an editor shows the stored draft in the same structure as generation produced (contact, summary, experience, education, skills) next to a live A4-like preview.
2. **Given** the editor, **When** the user edits contact details, the summary, an experience entry, an education entry or the skills, **Then** the preview updates immediately and the change is persisted on the server.
3. **Given** an experience entry, **When** the user edits a bullet, adds a bullet or removes a bullet, **Then** the entry reflects it in the preview and in the stored CV.
4. **Given** the user has changed something, **Then** the editor shows **Saving** while a save is in flight, **Saved** when the server has confirmed it, and **Error** (with a way to retry) if the save failed; "Saved" is never shown for a change the server did not accept.
5. **Given** saved edits, **When** the user reloads the page or opens the CV from another device, **Then** the latest saved content is shown; the server's stored version is authoritative over any local state.
6. **Given** a value that breaks the CV's rules (for example text over its length limit, an invalid email format or too many items), **When** the user enters it, **Then** the problem is shown next to the field, the invalid value is not saved, and the last valid saved content is kept.
7. **Given** a CV that is not `COMPLETED` (`PENDING` and `PROCESSING` are read-only generation states; `FAILED` has no valid completed draft), **When** a user attempts to edit it, **Then** editing is not offered and a write attempt is refused with a clear conflict message; nothing changes.
8. **Given** the user edits a field, **Then** the edit is treated as authoritative: no later automatic process replaces it without the user's explicit action.

---

### User Story 3 - Answer clarification questions (Priority: P1)

The CV generated in `002` carries clarification questions for missing or vague facts. In the editor they appear in a secondary assistance area, each in one of four states: **unanswered**, **answered**, **applied** or **dismissed**. The user types an answer; it is saved, but the CV is not changed yet, so they stay in control of when it takes effect. A question that is no longer relevant can be dismissed.

Unanswered and answered questions are *unresolved*; applied and dismissed questions are *resolved*.

**Why this priority**: Clarification is the reason questions were stored in `002`; without answering them the questions are dead weight and the draft stays incomplete.

**Independent Test**: Open a CV with questions, answer one, reload, and verify the answer persists, the question shows as answered, the CV content is unchanged, and the open-question count did not drop.

**Acceptance Scenarios**:

1. **Given** a completed CV with stored clarification questions, **When** the user opens the editor, **Then** each question is shown with its text, the part of the CV it concerns, and its current state (unanswered, answered, applied or dismissed).
2. **Given** an unanswered question, **When** the user submits a non-blank answer, **Then** the answer is saved, the question becomes **answered**, and the CV content is unchanged.
3. **Given** an answered but not yet applied question, **When** the user edits the answer, **Then** the new answer replaces the previous one and the question stays answered.
4. **Given** a blank or over-long answer, **Then** it is rejected with a clear message and nothing is saved.
5. **Given** an applied or dismissed question, **Then** its answer can no longer be changed and it is shown in its resolved state.
6. **Given** any question state, **When** the user reloads or returns later, **Then** the same state and answer are shown.
7. **Given** a question of another user's CV, **When** a user tries to answer it, **Then** the response is identical to answering a question on a CV that does not exist.
8. **Given** an unanswered or answered question, **When** the user explicitly dismisses it, **Then** it becomes **dismissed**, the CV content is unchanged, the unresolved count drops by one, and the dismissal persists after reload. A question is never dismissed automatically.
9. **Given** a dismissed or applied question, **When** a dismissal is attempted, **Then** it is refused and nothing changes.

---

### User Story 4 - Apply an answer to the right part of the CV, or set it aside (Priority: P1)

When the user is ready, they apply an answered question. The system updates only the CV section or entry the question was about, marks the question applied, and leaves everything else, including the user's other manual edits, exactly as it was. Simple facts (for example an email address, a phone number, an employment date or a location) are placed directly. Only when the answer needs professional wording (for example turning a description into a bullet or refining the summary) is the AI used, and then only on the relevant part.

**Why this priority**: This completes the loop the product promises: missing information is asked for, answered and reflected in the CV without regenerating it.

**Independent Test**: With a mocked AI, apply a simple-field answer (no AI call) and a wording answer (AI call limited to the relevant part); verify only the target changed, the question is applied together with that change, other manual edits are untouched, and a failure leaves both the CV and the question state unchanged.

**Acceptance Scenarios**:

1. **Given** an answered question about a simple field, **When** the user applies it, **Then** the value is placed in exactly that field without any AI call, the question becomes **applied**, and both changes become visible together.
2. **Given** an answered question that needs wording or transformation, **When** the user applies it, **Then** the AI is asked about only the relevant section or entry, the question, the answer and the minimum context needed; its structured output is validated; and only the intended part of the CV is updated.
3. **Given** the user manually edited other parts of the CV after generation, **When** they apply an answer, **Then** those other parts are unchanged afterwards.
4. **Given** an apply that fails for any reason (AI error, invalid or unsupported AI output, validation failure, the target no longer exists, a write conflict), **Then** the CV content is unchanged, the question is not marked applied and stays answered, and the user sees a clear message and can try again.
5. **Given** AI output that contains facts not supported by the answer or the relevant part of the CV, or output that does not match the expected structure, **Then** it is rejected and nothing is stored.
6. **Given** a question that is not answered, or already applied or dismissed, **When** apply is attempted, **Then** it is refused and nothing changes.
7. **Given** the AI provider is unavailable or not configured, **When** a wording-dependent answer is applied, **Then** it fails safely as in scenario 4; applying simple-field answers still works because it needs no AI.
8. **Given** the applied question, **When** the user reloads, **Then** it is still applied, the updated content is present, and the open-question count and display status reflect it.
9. **Given** the target field already holds a value the user entered or changed manually (or its entry was removed) since the question was created, **When** the user applies, **Then** the value is never overwritten silently: the apply is refused with a clear message, the CV and the question are unchanged, and the user can edit the CV by hand or **dismiss** the question (User Story 3, scenario 8). "Applied" is only ever recorded when the answer actually modified the CV.
10. **Given** a question whose target was filled in manually or removed, **When** the user dismisses it, **Then** it is closed as **dismissed** without changing the CV, it leaves the unresolved count, and the display status updates accordingly (a CV whose last unresolved question is dismissed becomes Completed).

---

### User Story 5 - Stale or failed writes never destroy work (Priority: P1)

The same CV can be open in two tabs or on two devices. A write based on an out-of-date version of the CV must not overwrite a newer one, and any multi-part change (apply plus marking the question applied) either happens completely or not at all.

**Why this priority**: Reliability and data integrity outrank feature breadth in the constitution; silent lost updates would undermine the "manual edits are authoritative" promise.

**Independent Test**: Load a CV in two sessions, save a change in one, then attempt to save from the other with the old version and verify a conflict is reported and the newer content is kept; force a failure in the middle of an apply and verify neither the content nor the question state changed.

**Acceptance Scenarios**:

1. **Given** two editors on the same CV, **When** the second one saves after the first has already saved, **Then** the second save is rejected as out of date with a conflict response (409), the first user's content is preserved, and the second user is told the CV changed and is offered the latest version.
2. **Given** a rejected stale write, **Then** nothing from it is stored, not even partially.
3. **Given** an apply, **Then** the content change and the "applied" marking are committed together or not at all; a failure between them cannot leave the CV changed with the question still unresolved, or the question applied with the CV unchanged.
4. **Given** the CV changed between the moment the user started an apply and the moment it would be stored (including while the AI was working), **Then** the apply is rejected as out of date and nothing changes.
5. **Given** the editor shows a save error or a conflict, **Then** the user's unsaved local text is not silently discarded before they choose to reload the latest version or retry.
6. **Given** concurrent identical requests (for example a double-clicked apply), **Then** the change is applied at most once.

---

### User Story 6 - Delete a CV I no longer need (Priority: P2)

From My CVs the user deletes one of their finished CVs (`COMPLETED` or `FAILED`) after confirming in the dialog defined in the Figma UI kit. The CV and its clarification questions are removed for good. A CV that is still generating cannot be deleted.

**Why this priority**: Users must be able to manage and clean up what they created, but nothing else depends on it.

**Independent Test**: Delete an owned CV through the confirmation dialog and verify it disappears from the list and cannot be opened; cancel the dialog and verify nothing is deleted; try to delete another user's CV and verify the not-found response.

**Acceptance Scenarios**:

1. **Given** a card, **When** the user chooses Delete, **Then** a confirmation dialog following the Figma pattern asks them to confirm; cancelling leaves the CV untouched.
2. **Given** the user confirms, **Then** the CV is permanently removed together with its clarification questions, it disappears from the list, and opening its address shows the same not-found page as for any missing CV.
3. **Given** a CV whose generation is `PENDING` or `PROCESSING`, **When** a delete is attempted, **Then** it is refused with a safe conflict response, the CV and its generation are unaffected, and the list does not offer an enabled Delete for it; **given** a `COMPLETED` or `FAILED` CV, **Then** deletion is allowed.
4. **Given** another user's CV id, **When** a user requests its deletion, **Then** the response is identical to deleting a CV that does not exist and nothing is deleted.
5. **Given** a failed deletion request, **Then** the user sees an error, the CV remains in the list, and they can try again.

---

### User Story 7 - Only the owner can touch a CV (Priority: P1)

Every new operation (list, edit, answer, apply, delete) is restricted to the CV's owner, with the same not-found behaviour already established in `002`, so that no one can learn that another user's CV exists.

**Why this priority**: Ownership is a security boundary required by the constitution.

**Independent Test**: With users A and B, run every operation as B against A's CV and A's questions, and compare each response with the response for a non-existent id; run each unauthenticated and expect refusal.

**Acceptance Scenarios**:

1. **Given** user B and a CV owned by A, **When** B tries to edit it, answer, apply or dismiss one of its questions, retry it, or delete it, **Then** each response is identical to the response for a non-existent CV, and A's data is unchanged.
2. **Given** a list request, **Then** it returns only the authenticated user's CVs; an identifier supplied by the client in the body, query, header or path is never used to choose whose CVs are listed.
3. **Given** an unauthenticated request to any of these operations, **Then** it is refused as unauthenticated.
4. **Given** a client that submits a question id belonging to a different CV than the one in the request, **Then** it is treated as not found and nothing changes.

---

### Edge Cases

- A user has a very large number of CVs: the list still returns all of them (no paging in this feature), with only the data the cards need.
- A CV is deleted while it is open in another tab: the next save, answer, apply, dismiss or refresh shows the not-found state, not a crash or a blank screen.
- A CV is retried or deleted from a stale list: if it is no longer `FAILED` the retry is refused as a conflict, and if it became active the delete is refused as a conflict; the list then refreshes to the true state.
- A CV changes from Processing to Failed or Completed while the user watches the list: the card updates without a reload; polling stops when none is active.
- Draft's `fullName` is blank or missing: the card shows `Untitled CV`.
- A card's display status is derived from stored data only (generation status and unresolved question count), so it is the same after reload and on any device.
- An edit empties a required-looking field (for example removes the only bullet or clears the name): allowed if it satisfies the CV rules; the editor shows the field as empty, it is not auto-refilled.
- A question refers to an entry that the user has since removed or heavily rewritten: apply is refused and the user may dismiss the question (User Story 4, scenarios 9 and 10); it is never dismissed automatically.
- Many quick edits in a row: only the latest content is saved, saves never run out of order, and the indicator reports the true last result.
- The user goes offline or the server is unreachable while editing: the editor shows **Error** with a retry, keeps the local text, and does not claim the change was saved.
- The user answers a question, then manually fixes the same fact in the CV before applying: the manual value is not overwritten; apply is refused and the user may dismiss the question (see User Story 4, scenario 9).
- Two applies of different questions at nearly the same time: they never overwrite each other's results; one of them may be told the CV changed and must be retried.
- A very long answer or pasted text: rejected by the same length limits as the CV fields, with a clear message.
- Source text or the answer contains instructions aimed at the AI: it is treated as data only and cannot change application rules, targets or scope.
- 320 px viewport: My CVs and the editor have no horizontal scrolling, even with long unbroken text.

## Requirements *(mandatory)*

### Functional Requirements

**My CVs list**

- **FR-001**: The system MUST provide an owner-scoped list of the authenticated user's CVs, ordered by last update with the most recent first, returning all of them with no paging.
- **FR-002**: Each list item MUST be a purpose-built summary (not the stored record) containing only: the CV id, target role, generation status, failure reason when the CV failed, last-updated time, candidate name (the draft's contact full name, or empty when unavailable), the count of unresolved clarification questions (`openQuestionsCount`) and whether a retry is available (see FR-006). The server computes the candidate name and the count so that the web client never inspects the stored draft or the questions to build a card. It MUST NOT include the draft body, source text or question text.
- **FR-003**: The list's owner MUST be taken only from the authenticated session; any user identifier supplied by the client MUST be ignored.
- **FR-004**: The display status MUST be derived as: `PENDING` or `PROCESSING` -> Processing; `FAILED` -> Failed; `COMPLETED` with one or more unresolved clarification questions -> Draft; `COMPLETED` with none -> Completed. *Unresolved* means unanswered or answered; applied and dismissed questions are resolved. `openQuestionsCount` MUST count unresolved questions only.
- **FR-005**: Each card MUST show the candidate name (`Untitled CV` when none), target role, last-updated time, display status, a state message appropriate to the status (Figma wording: for example "2 questions to strengthen your CV" for Draft, "Reviewed and ready to share" for Completed, "Structuring your experience…" for Processing, "Generation stopped. Your source is safe." for Failed), and the unresolved-question count where relevant.
- **FR-006**: Cards MUST offer: Open (Draft, Completed); View progress (Processing); Try again (Failed, only when the retry is available); Delete (Completed and Failed; not offered as enabled for Processing); and Download PDF where the Figma design shows it (Draft, Completed may show it), always disabled. Retry availability MUST be decided by the server using the same rule as the existing retry operation of `002`, and reported on each list item; the web client MUST NOT assume that every failed CV is retryable. A failure for which the server does not offer a retry MUST NOT expose an enabled Try again; a retry that the server refuses MUST be shown as a conflict and the list refreshed.
- **FR-007**: While any listed CV is `PENDING` or `PROCESSING`, the list MUST refresh about every 5 seconds, and MUST stop refreshing when none is active; polling MUST NOT run on a list with no active CV.
- **FR-008**: My CVs MUST show the empty state and the privacy note from the existing Figma design, show loading and failure states, and be the destination after sign-in and registration and the main authenticated landing page. Navigation that returned to the home screen or offered "Start a new CV" as the way back MUST read **Back to My CVs** where appropriate, and "My CVs" MUST be the active item in the header navigation while on the list.

**Manual editing**

- **FR-009**: Users MUST be able to edit, for a `COMPLETED` CV they own: contact details, professional summary, experience entries (employer, title, location, dates and bullets, with bullets editable, addable and removable), education entries and skills; and to add and remove experience and education entries within the existing limits.
- **FR-010**: Editing MUST use the existing structured CV model from `002` unchanged in shape and limits; no separate or incompatible editor model may be introduced. Every save MUST be validated against the same rules as generated drafts; an invalid save MUST be rejected with field-level messages and change nothing.
- **FR-011**: Saved edits MUST be stored on the server and MUST be present after reload or on another device. CV content MUST NOT be persisted in browser storage.
- **FR-012**: Manual edits MUST be treated as authoritative: no automatic process may replace or discard them without an explicit user action.
- **FR-013**: The editor MUST show a live A4-like preview that reflects local edits immediately, while the server's stored version remains the source of truth after each save or reload.
- **FR-014**: The editor MUST show a real save state: **Saving** while a save is in flight, **Saved** only after the server confirmed it, and **Error** with a way to retry when it failed.
- **FR-015**: Only a `COMPLETED` CV MUST be editable. `PENDING` and `PROCESSING` CVs are read-only generation states and a `FAILED` CV has no valid completed draft; edit, answer, dismiss and apply attempts against a CV that is not `COMPLETED` MUST be refused with a clear conflict message and change nothing.
- **FR-016**: Every successful edit, answer, dismissal or apply MUST update the CV's last-updated time so that the list order reflects real activity; reading and list polling MUST NOT.

**Clarification questions**

- **FR-017**: The editor MUST show the CV's persisted clarification questions with their state (unanswered, answered, applied, dismissed), the question text and the part of the CV they concern, in a secondary assistance area.
- **FR-018**: Users MUST be able to answer an unanswered question and to change the answer of an answered, unresolved question. Saving an answer MUST NOT change the CV content. Answers MUST be non-blank and within a length limit.
- **FR-019**: A question has exactly one of four states: unanswered, answered, applied, dismissed. *Applied* means the answer actually modified the CV; *dismissed* means the question was explicitly closed without modifying the CV. Applied and dismissed questions MUST be read-only and resolved; their state and answer MUST persist across reloads.
- **FR-020**: The state of a question MUST be stored on the server so that `openQuestionsCount`, the display status and the editor always agree.
- **FR-020a**: Users MUST be able to dismiss an unanswered or answered question, including when it no longer applies because its target was filled in manually or removed. Dismissal MUST require an explicit user action, MUST NOT change the CV content, and the system MUST NEVER dismiss a question automatically.

**Applying an answer**

- **FR-021**: Applying an answered question MUST change only the CV section or entry the question concerns, using the question's stored target; it MUST NOT regenerate or replace the whole CV, and the client MUST NOT be able to choose arbitrary locations or operations.
- **FR-022**: For simple single-value facts (for example contact details, dates, location, title, employer, institution, qualification) the answer MUST be applied deterministically without an AI call.
- **FR-023**: The AI MUST be used only when professional wording or transformation of the answer is required. When used, the request MUST contain only the relevant section or entry, the question, the answer and the minimum required context; it MUST require structured output; the output MUST be validated for structure and against the CV rules; and facts not supported by the answer or the relevant part of the CV MUST be rejected (the anti-invention rules of `002` apply).
- **FR-024**: Applying MUST NOT silently overwrite content the user entered or changed manually; when the target already holds a value the user entered or changed manually, or the target entry was removed, the apply MUST be refused with a clear message, leaving the CV and the question unchanged, and the user can edit the CV or dismiss the question. A question MUST be recorded as applied only when the answer actually modified the CV.
- **FR-025**: The content change and marking the question applied MUST be a single atomic change: either both are stored or neither is. A failed apply MUST leave the CV and the question exactly as they were.
- **FR-026**: AI use during apply MUST be bounded (limited retries and a time limit), MUST fail with a clear message rather than hang, and an AI failure MUST NOT affect simple-field applies or edits.
- **FR-027**: Applying a question that is not answered, already applied or dismissed, or not part of the addressed CV MUST be refused and change nothing; repeated or concurrent identical applies MUST take effect at most once.

**Safe updates and ownership**

- **FR-028**: Changes to the CV content (manual edits and apply) MUST use a simple optimistic concurrency check based on one per-CV revision counter that advances with every accepted content change, with no automatic merging: a write based on an out-of-date revision MUST be rejected with a conflict response (409) and MUST NOT change anything. The client MUST learn the latest revision so the user can reload it or retry. The editor saves automatically with debounced saves, one at a time and in order. Answering and dismissing change only a question, not the CV content, and are guarded by the question's own state (a resolved question cannot be answered or dismissed again).
- **FR-029**: An apply whose CV changed while it was being prepared (including while the AI was working) MUST be rejected as out of date with no change.
- **FR-030**: The editor MUST NOT discard unsaved local text on a conflict or error before the user chooses to reload the latest version or retry.
- **FR-031**: All list, edit, answer, dismiss, apply, retry and delete operations MUST be restricted to the CV's owner. For another user's CV, or a missing CV, or a question that does not belong to the addressed CV, the response MUST be identical (the not-found behaviour of `002`). Unauthenticated requests MUST be refused.

**Delete**

- **FR-032**: Users MUST be able to delete a `COMPLETED` or `FAILED` CV they own, after confirming in a dialog that follows the Figma UI kit's delete-confirmation pattern. Deletion MUST remove the CV and its clarification questions permanently.
- **FR-033**: Deleting another user's CV, or a CV that does not exist, MUST behave identically as not found and delete nothing. Deleting a CV that is `PENDING` or `PROCESSING` MUST be refused with a safe conflict response and change nothing, so that deletion never races with generation.

**UI and quality**

- **FR-034**: The My CVs and editor screens MUST follow the existing Figma file and UI kit (section "02 · My CVs" with its desktop grid, empty state and mobile frames; the editor frames for desktop and mobile; the delete dialog and save-indicator components) and reuse the existing design tokens and shared components (status badge, card, skeleton, button and link buttons, application header).
- **FR-035**: The editor MUST be document-first: on desktop the editing and assistance area is on the left and the live A4-like preview is on the right; on mobile it is a single column. My CVs shows a card grid on desktop and the mobile layout on phones.
- **FR-036**: Both screens MUST work at 320 px width with no horizontal scrolling, provide loading, empty and failure states, use real buttons and labelled form controls, and not rely on colour alone for status or errors.
- **FR-037**: The Download PDF action MUST be shown only where the Figma design shows it and MUST remain disabled, with no fake download behaviour; no PDF is generated in this feature.
- **FR-038**: Logs and error responses for these operations MUST NOT contain CV content, answers, prompts, raw model output, credentials or session identifiers.

### Key Entities *(include if feature involves data)*

- **CV**: The existing user-owned record with target role, generation state and stored draft. Gains a per-CV *revision* that advances with every accepted content change (manual edit or apply), so stale writes can be detected, and its last-updated time reflects real user activity. Exactly one owner.
- **Draft**: The existing validated structured CV (contact, summary, experience, education, skills). Becomes user-editable; its shape and limits do not change.
- **Clarification question**: The existing persisted question (target section and entry, what is missing, question text) extended with the user's **answer** and a state of **unanswered**, **answered**, **applied** or **dismissed** (the last two are resolved). Belongs to exactly one CV and is removed with it.
- **CV list item**: A read-only summary for My CVs: id, target role, generation status, failure reason (when failed), last-updated time, candidate name, unresolved-question count (`openQuestionsCount`) and whether a retry is available. Derived from stored data; not an editable record.
- **Display status**: Processing, Failed, Draft or Completed, derived from generation status and the unresolved question count; never stored separately.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in user can reach any of their CVs from My CVs in at most two interactions, and the list shows the correct display status, name, role, time and open-question count for 100% of tested states.
- **SC-002**: 100% of tested manual edits (every section, bullet add, edit and remove) are present after a reload and from a second session; 0 tested saves report "Saved" without being stored.
- **SC-003**: In 100% of tested stale-write scenarios the newer content is preserved and the stale writer is told the CV changed; 0 lost updates.
- **SC-004**: In 100% of tested apply scenarios only the intended section or entry changes and unrelated manual edits are unchanged; in 100% of tested failures neither the CV content nor the question state changes (0 partial applies).
- **SC-005**: 0 tested AI outputs that fail structural, domain or unsupported-fact validation are stored; simple-field applies perform 0 AI requests; the automated suite makes 0 real AI requests and passes with no AI credential configured.
- **SC-006**: 0 cases in tests where one user can list, read, edit, answer, dismiss, apply, retry, delete, or detect the existence of another user's CV or questions; every cross-user attempt equals the response for a non-existent CV.
- **SC-007**: A deleted CV and its questions are gone in 100% of tested deletions, cancelling the confirmation deletes nothing, and 0 tested deletions of a `PENDING` or `PROCESSING` CV succeed.
- **SC-012**: In 100% of tested cases a dismissed question stays dismissed after reload, never changes the CV, and leaves `openQuestionsCount`; 0 questions are dismissed without an explicit user action.
- **SC-008**: While a listed CV is processing, its card reaches its final status without a manual reload in 100% of tested cases, and list refreshing stops when no CV is active.
- **SC-009**: Users see Saving, Saved or Error that matches the true outcome of their last change in 100% of tested cases, including network failure and conflict.
- **SC-010**: My CVs and the editor work at 320 px with no horizontal scrolling and match the Figma design's structure for desktop and mobile.
- **SC-011**: The automated tests listed under Required Automated Test Coverage exist and pass.

## Required Automated Test Coverage

Tests MUST verify observable behaviour, MUST NOT depend on execution order, and MUST NOT call the real AI provider (it is replaced by a controllable test double).

- **List**: only own CVs; ordered by last update descending; the display-status derivation for every combination of generation status and question states; candidate name and its fallback; `openQuestionsCount` counting only unanswered and answered questions (applied and dismissed excluded); retry availability matching the existing retry rule for every failed state; the item shape contains no draft body, source text or question text; a client-supplied user id is ignored; unauthenticated refused.
- **Editing**: each section saved and read back; bullet add, edit, remove; invalid content rejected with field errors and nothing stored; `PENDING`, `PROCESSING` and `FAILED` CVs refused as not editable; last-updated time changes on write and not on read.
- **Concurrency**: a stale write is rejected and stores nothing; a fresh write succeeds and advances the revision; two concurrent writes never both succeed on the same revision; the stale write receives 409.
- **Clarification answers**: answer saved without changing the CV; answer replaceable until applied; blank and over-long answers rejected; applied and dismissed questions read-only; states persist; dismissal of an unanswered and of an answered question works, never changes the CV, is refused for resolved questions, and is never automatic.
- **Applying**: a simple-field answer applied with no AI call; a wording-dependent answer applied through the AI test double with only the relevant section, the question, the answer and minimal context in the request; invalid, malformed, unsupported-fact and provider-failure outputs leave CV and question unchanged; unrelated manual edits unchanged; the change and the applied marking are atomic (forced failure leaves both unchanged); repeated and concurrent applies take effect once; a CV that changed during preparation is rejected; an apply onto a target the user already filled or removed is refused and changes nothing, after which the question can be dismissed.
- **Delete**: a `COMPLETED` and a `FAILED` CV deleted with their questions; a `PENDING` and a `PROCESSING` CV refused with a conflict and left intact; foreign and missing ids behave identically.
- **Ownership**: for list, edit, answer, dismiss, apply, retry and delete, user B's attempts against user A's CV and questions are indistinguishable from a non-existent id; a question id from another CV is not found; unauthenticated requests refused.
- **Web**: My CVs polling runs only while a listed CV is active and stops otherwise; Try again shown only when retry is available, View progress, and Delete confirmation behaviour (no enabled Delete while processing); redirect to My CVs after sign-in; dismiss interaction; save indicator transitions (Saving, Saved, Error, conflict); editor form validation; clarification answer and apply interactions; the disabled Download PDF action.

## Acceptance Criteria

- **AC-001**: My CVs lists only the signed-in user's CVs, newest update first, each with the specified name, role, time, display status, message and open-question count, and is the landing page after sign-in and registration, with My CVs as the active navigation item.
- **AC-002**: The display status mapping (Processing, Failed, Draft, Completed) is correct for every state combination, and the list refreshes while a CV is active and stops when none is.
- **AC-003**: Cards offer Open, View progress, Try again (only when the server reports a retry is available), Delete (not enabled while processing) and a disabled Download PDF exactly as specified, and the empty state and privacy note match Figma.
- **AC-004**: A user can edit contact, summary, experience (with bullets), education and skills; edits are validated, saved on the server and present after reload; the editor shows a true Saving/Saved/Error state and a live A4-like preview.
- **AC-005**: A user can answer a clarification question without changing the CV; unanswered, answered, applied and dismissed states persist, and only unanswered and answered questions count toward `openQuestionsCount`; a user can explicitly dismiss a question without changing the CV.
- **AC-006**: Applying an answer updates only the intended section or entry, deterministically for simple fields and through validated, scoped AI output only when wording is needed; unrelated edits are untouched.
- **AC-007**: A failed apply changes nothing, and the content change plus the applied marking are atomic.
- **AC-008**: A stale write is rejected with a conflict (409) and cannot overwrite newer content; repeated applies take effect once.
- **AC-009**: A user can delete their own `COMPLETED` or `FAILED` CV after confirming; the CV and its questions are removed; cancelling deletes nothing; deleting a `PENDING` or `PROCESSING` CV is refused with a conflict.
- **AC-010**: Every new operation is owner-only with not-found behaviour identical to a missing CV; unauthenticated requests are refused.
- **AC-011**: All AI use in this feature goes to Anthropic, is limited to the relevant part of the CV, and the automated tests make no real AI request.
- **AC-012**: My CVs and the editor work at 320 px with no horizontal scrolling, follow the Figma design, and no CV content is stored in browser storage.
- **AC-013**: The Download PDF action is present where specified and disabled.

## Assumptions

- **Foundation**: Authentication, sessions, ownership and the identical not-found response for foreign CVs from `001` and `002` are reused unchanged. The structured draft shape, its limits, the generation lifecycle, retry and the persisted clarification questions from `002` are reused.
- **Editor location**: The completed CV view at the existing CV address becomes the editor; generation progress and failure views stay as in `002`. "Open" and "View progress" both lead to that address and it shows the view that matches the state.
- **Editable states**: Only `COMPLETED` CVs are editable. A failed CV is retried (as in `002`), not edited.
- **Retry availability**: "Try again" is shown only when the server reports the retry as available, decided by the same rule the retry operation of `002` enforces. Under today's rules that is a CV in `FAILED`; no separate retryable flag or per-reason rule is assumed, and if the rule becomes stricter, the list follows it without a web change.
- **Questions with no target change**: Existing questions from `002` are mapped to the four states: an open question without an answer is unanswered; a question already marked resolved before this feature existed (none are produced by `002`) is treated as applied. Dismissed is new. Any question the system cannot apply automatically to a specific field is still answerable and applicable under the rules above.
- **Which answers need the AI**: Simple single-value facts are applied deterministically; answers that must be turned into professional prose (summary text, bullet points, descriptions) use the AI. The exact mapping per question target is decided in planning and MUST favour deterministic application whenever the result is unambiguous.
- **Saving**: Edits save automatically shortly after the user stops typing, and never out of order; there is no explicit "Save" requirement beyond the retry on error. Saves are debounced. Concurrency is detected with one simple per-CV revision counter, not a merge; a stale save receives a conflict (409). On conflict the user chooses between reloading the latest version and retrying; automatic merging is out of scope.
- **Unresolved questions**: A question is unresolved while it is unanswered or answered; applied and dismissed questions are resolved. `openQuestionsCount` counts unresolved questions.
- **Time shown**: "Last updated" uses the CV's last-updated time, shown in a human-friendly relative or short date form, in the user's locale.
- **List size**: No paging or search; a user is expected to own a modest number of CVs.
- **Polling**: List refresh runs about every 5 seconds and only while a listed CV is `PENDING` or `PROCESSING`.
- **Deleting a generating CV**: Not allowed; refused with a conflict until the generation is `COMPLETED` or `FAILED`, which avoids races between deletion and generation.
- **Download PDF**: Shown disabled only where the Figma design shows it (Draft and Completed cards, and the editor header if the design has it), with an explanation that export is coming; no fake download behaviour; implemented in feature 004.
- **Figma limits**: Icons come from the existing icon set used in `002` where Figma assets are unavailable; the Figma wording for state messages is the source of copy.
- **Constraints inherited, not restated**: Technology, architecture, strict typing, testing and data-integrity rules come from the project constitution and `.claude/rules/`. They are intentionally not repeated or decided here, including endpoint shapes, the revision mechanism, schema changes and prompt wording.

### Out of Scope

PDF generation and export (feature 004), multiple templates and template switching, tailoring a CV to a job description, version history, collaboration, rich-text or WYSIWYG editing frameworks, drag-and-drop editing, public sharing links, paging, search and filtering of the list, automatic merging of conflicting edits, duplicating a CV, creating a CV without generation, OAuth, password reset, email verification, payments and admin tooling.
