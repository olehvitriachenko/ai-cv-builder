# Feature Specification: Submission Readiness

**Feature Branch**: `006-submission-readiness`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "Feature 006 submission readiness: make the take-home deliverable ready to hand in: full-stack docker compose run (api, web, PostgreSQL, ANTHROPIC_API_KEY from the environment), README with setup and trade-offs, feature-based web code organisation (already done by refactors), and the PDF preparation flow from Figma 10.5 (preparing dialog in the full-screen preview). Keep it a simple specification."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run the whole product with one command (Priority: P1)

A reviewer clones the repository, supplies the AI key through the environment and starts everything with a single command. The web app, the API and the database come up together; the reviewer registers, creates a CV and reaches the editor without any manual database or build step.

**Why this priority**: The assignment is judged by running it locally; if it does not start, nothing else is seen.

**Independent Test**: On a machine with only the container tooling installed, copy the example environment file, set the key, run the one start command and complete register → create CV → open editor in the browser.

**Acceptance Scenarios**:

1. **Given** a fresh clone and the key in the environment, **When** the reviewer runs the start command, **Then** the database, the API and the web app start in the right order and the web app is reachable on its documented address.
2. **Given** the stack is running, **When** the reviewer registers and submits a CV request, **Then** the generation completes with the real AI provider and the CV opens in the editor.
3. **Given** no key is supplied, **When** the stack starts, **Then** everything except real generation works (sign-up, My CVs, the editor on existing CVs, PDF download) and a generation attempt ends in a clear, recoverable failed state instead of a crash or an endless wait.
4. **Given** the stack was stopped and started again, **When** the reviewer signs in, **Then** their CVs are still there; removing the stored data is a separate, clearly documented, destructive step.
5. **Given** the repository, **Then** no real secret is committed and the example environment file lists every variable the stack reads.

---

### User Story 2 - Understand the project from the README (Priority: P1)

A reviewer opens the README and learns how to run the product, how to run the tests, how the system is built, why it was built that way, how the AI is kept from inventing facts, what was simplified, what would come next and how AI coding tools were used.

**Why this priority**: The README is a required deliverable and the reviewer's first and often only explanation of the decisions.

**Independent Test**: A person who has not seen the project follows the README alone: runs the product, runs the tests, and can answer "how is hallucination prevented?" and "what was simplified?".

**Acceptance Scenarios**:

1. **Given** the README, **When** a reviewer follows the run section, **Then** they reach a working product without reading any other file.
2. **Given** the README, **Then** it states how to run each kind of test and which ones need the database or the AI key (none of the automated tests call the real AI).
3. **Given** the README, **Then** it explains the architecture and the major decisions in a few paragraphs and names the trade-offs that were accepted (for example: skills are prompt-grounded and not mechanically verified, the page count in the preview is an estimate, a save conflict is resolved by choosing a whole version).
4. **Given** the README, **Then** it lists what was simplified, what would be done with more time and how AI coding tools were used.

---

### User Story 3 - See that the PDF is being prepared (Priority: P2)

While a person downloads a PDF from the full-screen preview, a clear "Preparing your PDF…" message appears over the dimmed preview, so they know the download is in progress and what file they will get.

**Why this priority**: Preparing the file can take a moment; without feedback the person may click again or leave. It completes the already built full-screen preview and download.

**Independent Test**: Open the full-screen preview, press Download PDF with a slow connection; the message appears, the button reads "Preparing…", and when the file arrives the message disappears and the download starts.

**Acceptance Scenarios**:

1. **Given** the full-screen preview, **When** the person presses Download PDF and preparing takes noticeable time, **Then** the preview is softly dimmed and a centred message with a progress indicator shows "Preparing your PDF…", the line "We're formatting your CV for download." and the file name; the navigation button reads "Preparing…" and cannot be pressed again.
2. **Given** the message is shown, **When** the file is ready, **Then** the download starts and the message disappears.
3. **Given** a download that finishes almost at once, **Then** no message flashes on screen.
4. **Given** the message is shown, **When** the person closes the preview, **Then** the preview closes and the download still completes.
5. **Given** the download fails, **Then** the message disappears and the person is told what happened, as before this feature, and can try again.
6. **Given** a phone-sized screen, **Then** the message fits the screen width and the dimming covers the preview.

---

### User Story 4 - Find code by feature (Priority: P3)

A reviewer browsing the web code finds each product area (sign-in, My CVs, generation, the editor, PDF download) in its own place, with its screens, its rules and its server calls together, and shared building blocks apart.

**Why this priority**: It makes the code easy to review, but the product does not change; the reorganisation is already done by refactors and this story records the requirement it must keep satisfying.

**Independent Test**: Pick any product area and locate all of its code in one place; run the full checks and see them pass unchanged.

**Acceptance Scenarios**:

1. **Given** the repository, **Then** each product area has one place that holds its screens, its rules and its server calls, and shared parts live outside the areas.
2. **Given** the reorganisation, **Then** the product behaves as before and every automated check still passes.

---

### Edge Cases

- The key is wrong or the AI provider is unreachable: generation ends in the existing failed state with a retry; nothing hangs.
- The database is not ready when the API starts: the stack waits for it instead of failing.
- A port the stack uses is already taken: the documented ports can be changed through the environment.
- The stored data from an earlier run exists: it is kept across restarts and the README says how to wipe it.
- The person presses Download PDF repeatedly: only one preparation runs.
- A very long candidate name or role: the file name in the message wraps inside the surface and never overflows it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST start the whole product (database, API, web app) with one documented command, without manual database or build steps.
- **FR-002**: The AI key MUST be supplied through the environment only; no real secret is committed, and an example environment file MUST list every variable the stack reads.
- **FR-003**: The stack MUST start its parts in a safe order (the database ready before the API, the API ready before the web app) and MUST keep stored data across restarts.
- **FR-004**: Without a key, everything except real generation MUST still work, and a generation attempt MUST end in the existing failed, retryable state with a clear message.
- **FR-005**: The documented addresses and ports MUST be changeable through the environment.
- **FR-006**: The README MUST explain how to run the product and how to run each kind of test, and which tests need the database or the key.
- **FR-007**: The README MUST explain the architecture, the major decisions, how hallucination is prevented and its limits, what was simplified, what would change with more time and how AI coding tools were used.
- **FR-008**: The README MUST state the accepted trade-offs of the earlier features that a reviewer could mistake for defects.
- **FR-009**: While a PDF is being prepared in the full-screen preview, the system MUST show a dimmed preview with a centred message ("Preparing your PDF…", "We're formatting your CV for download.", the file name) and a progress indicator, and the navigation action MUST read "Preparing…" and be unavailable.
- **FR-010**: The preparing message MUST appear only when preparing takes noticeable time, MUST NOT flash for a fast download, MUST NOT take keyboard focus, and MUST NOT stop the person closing the preview or the download completing.
- **FR-011**: The file name shown MUST be the name the downloaded file will have.
- **FR-012**: When the download completes or fails, the message MUST disappear; a failure MUST be reported as it was before this feature.
- **FR-013**: Each product area of the web app MUST keep its screens, rules and server calls together, with shared parts separate, and the reorganisation MUST NOT change behaviour.
- **FR-014**: All automated checks (type checks, lint, unit and end-to-end tests) MUST pass, and none of them may call the real AI provider.

### Key Entities

- **Run configuration**: the settings a reviewer provides to start the stack (the AI key, optional model, ports); described by the example environment file.
- **PDF preparation**: the short period between pressing Download PDF and the file arriving; has a file name and a visible state while it lasts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reviewer with only container tooling installed reaches the running web app and completes register → create CV → open editor within 10 minutes of cloning, following the README alone.
- **SC-002**: With no key supplied, 100% of non-generation features work and 100% of generation attempts end in a clear failed state within the generation time limit.
- **SC-003**: After a stop and start, 100% of previously created CVs are still available.
- **SC-004**: The README answers each of the eight questions of the constitution (run, test, architecture, decisions, hallucination prevention, simplifications, next steps, AI tool use), checked by reading it once.
- **SC-005**: In the full-screen preview, the preparing message appears for 100% of downloads that take longer than 0.5 seconds and for none that finish faster than 0.2 seconds.
- **SC-006**: 0 repeated downloads start while one is being prepared.
- **SC-007**: 100% of the full automated check suite passes with no real AI request.

## Assumptions

- The reviewer has the container tooling and a browser; the real AI key is theirs.
- Deployment to a hosted environment is out of scope; only local reproducibility is required.
- The web code reorganisation and the stack files are being produced on this branch in parallel; this specification states the outcome they must reach, not how.
- The preparing message applies to the full-screen preview only (the only frame designed); other download buttons keep their current busy state.
- The "ready" and "failed" states of the download are not new designs: ready is the file arriving, failed keeps the existing error message.
- The preparing message's timing (appears after about 0.3 s, stays at least 0.7 s) is a default chosen for the design; the design does not specify it.
