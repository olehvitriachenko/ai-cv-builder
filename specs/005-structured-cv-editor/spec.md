# Feature Specification: Structured CV Editor

**Feature Branch**: `005-structured-cv-editor`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Replace the accordion editor of `003` with the structured, always-expanded editor from the Figma section `05 · Forma / Structured CV editor` (10 frames), delivered in small iterations. Skills become grouped by category (user-confirmed from reference screenshots); the target role becomes editable; `Improve with AI` is not shown."

**Figma** (file `eIMIhyfYr4eO9gs2pZxhqJ`, section `41:26775`): 05.1 Desktop Normal `41:21756`, 05.2 Clarification answered `41:22159`, 05.3 Clarification applied `41:22585`, 05.4 Saving `41:23028`, 05.5 Save error & conflict `41:23434`, 05.6 Experience editing `41:23864`, 05.7 Skills editing `41:24274`, 05.8 Mobile 390 `41:24695`, 05.9 Mobile 320 `41:25054`, 05.10 Fullscreen CV preview `41:28492`.

## Context

`002` generates a structured CV draft and `003` lets the user edit it (autosave, revision conflicts), answer and apply clarification questions, and manage CVs. This feature changes how the same capabilities are presented and extends the CV content in two ways: skills are grouped by category and the target role can be edited. It does not change generation lifecycle, ownership rules, the optimistic concurrency mechanism, or the clarification state model.

Feature `004-pdf-export` is **implemented and merged into this branch**: a completed CV can be downloaded as an A4 PDF with selectable text (`GET /api/cvs/:id/pdf`), and Download PDF is a working action in the editor and on My CVs. This feature reuses that flow as it is and only keeps the export working with the new skills shape (draft version 2); it adds no PDF capability.

The design frames are the visual source of truth. Where two frames disagree (05.2 and 05.3 show skills as one flat list of chips, 05.1, 05.5, 05.7 and the mobile frames show them by category), the category design wins, as confirmed by the user.

## Clarifications

### Session 2026-10-05

- Q: How are existing CVs whose skills are a flat list brought to the new shape: one-time database migration or conversion at read time? → A: A one-time, repository-tracked database migration moves every stored draft to `schemaVersion` 2, mapping the flat skills list into a single default "Skills" category. After it, application code supports only the new draft shape; there is no runtime dual-format conversion. The migration is verified on a clean database, on a database with existing `002`/`003` drafts, on drafts with empty skills, and on drafts already at version 2 (which it must leave untouched).
- Q: Does the AI group skills by category when it generates a new CV? → A: Yes. Generation groups the skills it finds under the predefined categories of the appendix; anything it cannot place goes to "Skills". The grouping never adds a skill the source does not state; as in `002`, this is governed by the prompt contract and the user's review, not by a mechanical check.
- Q: Which fields count toward the completeness score and for how much? → A: The fixed formula in the appendix (nine items summing to 100%); phone 10% and LinkedIn 5% match the design. The score is advisory and never blocks saving.
- Q: How is a save conflict resolved in "Review both versions"? → A: By choosing one whole version: "Keep my version" saves the local document on top of the latest saved revision, "Use saved version" discards the local edits. Differences are highlighted per section for review only; there is no per-section choice and no automatic merge.
- Q: Which behaviours are locked before tasks? → A: The more-options menu has exactly **Back to My CVs** and **Delete CV**. Removing an education entry, a highlight, a link or a skill is immediate with no confirmation (autosave stores it); removing an experience entry that holds something and a category that holds skills asks first (Figma 00.4 "Removal confirmation", changed after the design was completed). Deleting a whole CV still requires the existing confirmation dialog. The predefined skill categories and their suggestions live in one centralized configuration file; an incomplete list never blocks implementation (entries are added later as data). Skill grounding is **prompt-based, not mechanical** and is documented as a trade-off, never claimed as verified.
- Q: How does the merged PDF export (`004`) interact with this feature? → A: It is a working feature, not future work. The editor header and the full-screen preview reuse its Download PDF flow as it is, and the export is updated only to read draft version 2 (skills grouped by category, names preserved, migrated CVs exporting with all their skills). No new PDF features, templates or dependencies.
- Q: How are skill categories reordered? → A: With Move up / Move down buttons in each category's header (keyboard and 320 px friendly); no drag-and-drop and no new dependency. The design's drag handle is replaced by these two icon buttons.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit every part of my CV in one structured screen (Priority: P1)

The user opens a completed CV and sees all sections as always-open cards in a single left column: Personal details, Professional summary, Professional experience, Skills & Technical Competencies and Education, with the A4 preview on the right following every change. A sticky navigation bar shows where they are (`My CVs` breadcrumb, CV title, owner), the save state and the working Download PDF of feature `004`.

**Why this priority**: It is the core editing experience; every other story builds on this layout.

**Independent Test**: Open a completed CV, change one field in each section, reload, and verify the preview and the stored CV show the changes; add and remove an experience entry, a highlight, an education entry and a link.

**Acceptance Scenarios**:

1. **Given** a completed CV, **When** the user opens it, **Then** the sticky navigation, the completeness card, the AI Assistant card (when there are questions) and the five section cards are visible without expanding anything, and the preview is beside them on desktop.
2. **Given** Personal details, **Then** the user can edit target role, full name, email, phone, location, LinkedIn and portfolio, and can add further links with **+ Add link**; empty optional fields show their placeholder.
3. **Given** the Professional summary card, **Then** the user edits the summary text directly, and there is no Improve with AI action.
4. **Given** Professional experience, **Then** each entry shows title, company, start date and end date (with **Present** as an end date choice) and its highlights; the user can edit any of them, add a highlight with **+ Add bullet**, remove a highlight, add an entry with **+ Add professional experience**, and remove an entry.
5. **Given** Education, **Then** each entry shows institution, degree/program, start year and end year (labelled expected when ongoing) with a "Currently studying" summary line; the user can edit them, remove an entry with **Remove**, and add one with **+ Add education**.
6. **Given** a changed target role, **When** the change is saved, **Then** it is the target role shown on My CVs, in the editor header and in the preview subtitle after reload.
7. **Given** a CV that is not `COMPLETED`, **Then** the editor stays read-only exactly as in `003`.

---

### User Story 2 - Organise skills by category (Priority: P1)

In Skills & Technical Competencies the user builds skill groups. Each group is a card with a **Category Name** chosen from a searchable list (or typed), an input to add skills, suggestions for that category, and a dashed **No items added** state until something is added. Added skills appear as removable chips grouped by category with a per-category count, and **+ Add skills** starts another category. The preview and the CV show skills under their categories.

**Why this priority**: It is the one change to the CV content model; later stories and the PDF export (`004`) depend on the final shape.

**Independent Test**: Add two categories with skills, remove one skill, reorder the categories, reload, and verify the grouping and order are preserved in the editor and the preview.

**Acceptance Scenarios**:

1. **Given** the Skills card, **When** the user opens the category list and types, **Then** it filters the predefined categories (Programming Languages, Frameworks, Databases, Data & Analytics, AI & Machine Learning, Cloud & Infrastructure, DevOps & CI/CD, Architecture & System Design, Testing & Quality Assurance, Security & Privacy, Mobile Development, Frontend Specialization, IT Support Tools, Customer Support Tools, Leadership, Analytical & Problem-Solving, Communication, Collaboration, Human Resources & People Operations and the others the design lists) and the user can pick one or enter their own name.
2. **Given** a chosen category, **When** the user types a skill and presses **Add** (or Enter), **Then** the skill is added to that category; an empty, duplicate (case-insensitive within the CV) or over-long skill is refused with a visible message and nothing is added.
3. **Given** a category with suggestions, **When** the user taps a suggested skill, **Then** it is added to that category; suggestions already present are not offered again. Suggestions are a fixed convenience list shown on the page and are never stored or sent anywhere until the user taps one.
4. **Given** fewer than five skills in total, **Then** the hint "It is suggested to add at least 5 skills" is shown; it never blocks saving.
5. **Given** added skills, **Then** they are shown as removable chips under their category name with a count ("3 skills"), and an empty category shows the dashed "No items added" state; a category that stays empty is not saved.
6. **Given** two or more categories, **When** the user presses Move up or Move down on a category, **Then** it swaps with its neighbour (the first cannot move up, the last cannot move down), the new order is saved and used by the preview, and the controls work by keyboard.
7. **Given** a CV created before this feature, **When** it is opened after the migration, **Then** its existing skills are shown in one category named "Skills" and nothing is lost; a CV that had no skills has no skill category.

---

### User Story 3 - Work through AI clarification questions in the structured editor (Priority: P1)

The AI Assistant card shows the number of unresolved questions and each question as a card with its kind (for example Factual), the part of the CV it concerns, its state (Unanswered, Answered, Applied) and its actions, as in frames 05.1, 05.2 and 05.3. Behaviour is exactly the `003` clarification behaviour.

**Why this priority**: Clarifications are how missing facts get into the CV without invention.

**Independent Test**: With an unanswered question, answer it (the card shows Answered and "Answer saved separately. Your CV stays unchanged until you apply it."), apply it (the card shows Applied and the right CV part changes), dismiss another, reload, and verify states and the completeness card.

**Acceptance Scenarios**:

1. **Given** an unanswered question, **Then** Apply to CV is disabled and the helper reads "Answer autosaves separately. AI never fills in missing facts."
2. **Given** an answered question, **Then** the answer is shown with a saved indicator, Apply to CV is enabled, and the helper says the CV stays unchanged until applied.
3. **Given** an applied question, **Then** it shows the applied state as in 05.3 and its effect is visible in the section and the preview; **given** a dismissed question, **Then** it no longer counts as unresolved.
4. **Given** no unresolved questions, **Then** the AI Assistant card shows an empty/complete state instead of an empty list.

---

### User Story 4 - Trust the save state, even when saving fails (Priority: P1)

The navigation bar shows the true save state (All changes saved, Saving, Couldn't save · Retry). When a save fails or the CV changed elsewhere, a notice at the top of the editor explains it, keeps the user's local text, offers **Retry connection**, and for a conflict offers **Review both versions** comparing the current local edits with the saved account version, never overwriting automatically.

**Why this priority**: Losing work silently is the worst editor failure.

**Independent Test**: Go offline and edit (Couldn't save, local text kept, Retry works after reconnect); edit the same CV in two tabs (conflict notice, both versions comparable, the user chooses).

**Acceptance Scenarios**:

1. **Given** a save in flight, **Then** the status reads Saving; **given** a stored save, **Then** it reads All changes saved; **given** a failed save, **Then** it reads Couldn't save with a Retry action and the preview says it shows the last saved version.
2. **Given** a stale write, **Then** the notice "A newer saved version needs review" appears with "Current local · not saved" and "Saved account version" labels, nothing is overwritten, and the user can open **Review both versions**.
3. **Given** the conflict review, **When** the user chooses **Keep my version** or **Use saved version**, **Then** only that choice is stored and the other version is discarded only by that choice; retrying the connection is separate from choosing a version.

---

### User Story 5 - Check the document at full size (Priority: P2)

The preview has a toolbar (Preview, Classic · A4, Page 1 of 1, zoom − / + with a percentage, and an expand button), a status line (Up to date · Ready to download, or Last saved version while unsaved) and an expandable full-screen view with a scrim, a centered A4 page, page and zoom controls, **Fit page**, **Close preview** (Esc) and the working Download PDF of `004`.

**Why this priority**: It improves review quality but editing works without it.

**Independent Test**: Zoom in and out, expand the preview, close it with the button and with Esc, and verify the edit state is unchanged.

**Acceptance Scenarios**:

1. **Given** the preview, **When** the user changes zoom, **Then** the page scales within a sensible range and the percentage shows it; Fit page restores the fitted size.
2. **Given** the expand button, **When** pressed, **Then** the full-screen preview opens over a dimmed editor; Esc or Close preview returns to the editor with focus where it was and no edits lost.
3. **Given** unsaved or failed changes, **Then** the status line says the preview shows the last saved version.

---

### User Story 6 - Edit comfortably on a phone (Priority: P2)

At 390 px and 320 px the editor is one column with a navigation bar (back to My CVs, title, PDF), a status row (All changes saved · 85% ready · 2 missing), an **Edit / Preview** switch, the same section cards, and a sticky **Preview CV** action ("Preview opens on its own tab. Your edits stay here.").

**Why this priority**: Required by the product, but follows the desktop structure.

**Independent Test**: At 390 and 320 px, edit all sections, switch to Preview and back, and verify there is no horizontal scrolling and no edits are lost.

**Acceptance Scenarios**:

1. **Given** 320 px width, **Then** every section, the category card and the combobox list fit without horizontal scrolling.
2. **Given** the Edit / Preview switch, **When** the user opens Preview and returns, **Then** their unsaved text and scroll position are kept.
3. **Given** the sticky preview action, **Then** it never covers a field that is focused or the last section's actions.

---

### Edge Cases

- A target role that is blank or longer than the limit: refused with a field message, nothing saved for that field.
- Two categories with the same name: refused (names are unique within a CV, case-insensitive).
- A category list of more than the allowed number of categories or skills: refused with the limit shown; limits follow the existing draft caps.
- A draft that is already version 2 meets the migration: it is skipped unchanged; a draft with an empty skills list becomes version 2 with no skill category; a malformed draft stops the migration with a clear error instead of being altered silently.
- Removing the last experience or education entry: allowed; the section shows its empty state with the add action.
- An experience marked **Present** with a start date later than an end date elsewhere: the existing draft validation applies; the message is shown on the field.
- A CV with the maximum amount of content (12 categories, 60 skills, 30 experience entries, 10 education entries) is exported as a PDF: it succeeds with nothing clipped or dropped.
- A user adds skills from suggestions while a save is in flight: both land in the next save; none is lost or duplicated.
- A clarification applied to skills adds to the named category (or the category the question concerns) and never removes existing skills.
- Reduced motion: opening the full-screen preview does not animate.

## Requirements *(mandatory)*

### Functional Requirements

**Layout and navigation**

- **FR-001**: The editor MUST show a sticky navigation bar with the product mark, a `My CVs` breadcrumb back to the list, the CV title (target role) and owner line, the save state, the working Download PDF action of `004` and a more-options menu containing exactly **Back to My CVs** and **Delete CV** (Delete CV opens the existing confirmation dialog); on mobile the same information is condensed as in frames 05.8 and 05.9.
- **FR-002**: Section cards MUST all be visible without expanding (no accordion); on desktop the structured editor is the left column and the preview the sticky right column.
- **FR-003**: The editor MUST show a completeness card with a percentage, a progress bar and the missing items, each with its percentage gain (for example `+10% Phone number`, `+5% LinkedIn`), and the label "Needs details · N left" where N is the number of missing items. The score MUST be the fixed formula in the appendix (nine items, 100% in total), a deterministic function of the current local draft, updated as the user types, and MUST NOT block saving or exporting.

**Content editing**

- **FR-004**: Personal details MUST allow editing target role, full name, email, phone, location, LinkedIn, portfolio and additional links; the target role is stored with the CV (not in the draft), is subject to the same revision check as other edits, and MUST be non-blank and within its limit.
- **FR-005**: The Professional summary MUST be editable text; no AI rewrite action is offered.
- **FR-006**: Experience MUST support adding and removing entries and adding, editing and removing highlights; removing an education entry, a highlight, a link or a skill is immediate with no confirmation, while removing an experience entry that holds something asks first and names what goes with it; the end date MUST allow a **Present** choice; education MUST support adding and removing entries; all within the existing draft caps and validation.
- **FR-007**: Skills MUST be stored grouped by category: a CV has an ordered list of categories, each with a name (1 to 60 characters, unique within the CV) and an ordered list of skills (existing skill limits apply). Empty categories MUST NOT be saved. Categories MUST be reorderable with Move up / Move down controls (no drag-and-drop); the order is saved and used by the preview.
- **FR-008**: The category field MUST offer a searchable list of predefined categories and accept a custom name; the skill input MUST add on the Add button and on Enter, trim input, and refuse blank, duplicate (case-insensitive across the CV) and over-long skills with a visible message.
- **FR-009**: The predefined categories and their suggested skills MUST live in one centralized configuration file used by both the web app and the API (no second copy); a missing or extra category in it never blocks any feature. Suggested skills MUST be the static convenience list per predefined category defined in the appendix (4 to 6 per category), MUST be shown only until chosen, and MUST NOT be stored, sent to a server or generated by AI.
- **FR-010**: A one-time, repository-tracked migration MUST move every stored draft to `schemaVersion` 2, mapping a flat skills list into one category named "Skills" (no category when the list is empty) in the original order, and MUST leave drafts that are already version 2 unchanged and never re-migrate them (running it twice has no further effect). After the migration the application MUST read, validate and write only the version 2 shape; it MUST NOT convert between shapes at runtime. AI generation MUST produce skills in the grouped shape using the predefined categories of the appendix (unplaceable skills go to "Skills") and only skills stated in the source, and the answer-apply feature MUST be able to add a skill to a named category without removing others.

**Clarifications, saving and preview**

- **FR-011**: Clarification behaviour (states, answer, dismiss, apply, atomicity, conflict) MUST remain exactly as defined in `003`; only the presentation changes. The AI Assistant card MUST show the unresolved count and per-question state as in frames 05.1 to 05.3.
- **FR-012**: The save state MUST reflect the true outcome (Saved only after the server confirms) and show Saving, Saved and Couldn't save · Retry; local text MUST never be discarded on failure or conflict before the user decides.
- **FR-013**: A conflict MUST show both the local version and the saved account version for review, with differences highlighted per section, and MUST let the user choose one whole version: **Keep my version** (saves the local document on top of the latest saved revision) or **Use saved version** (discards the local edits). There is no per-section choice and no automatic merge or overwrite; retrying the connection is separate from choosing a version.
- **FR-014**: The preview MUST reflect local edits immediately, show Page N of M for the document, offer zoom controls and a full-screen view with Fit page and Esc to close, and state whether it shows the current or the last saved version.
- **FR-015**: On phone widths the editor MUST use a single column with an Edit / Preview switch and a sticky Preview action and MUST NOT scroll horizontally at 320 px.

**Constraints**

- **FR-016**: Ownership, authentication, the revision mechanism, error codes and the not-found-for-foreign-CV behaviour from `001` to `003` MUST be unchanged and apply to every new operation, including target role edits.
- **FR-017**: Logs and error responses MUST NOT contain CV content, answers, skills or target role text.
- **FR-018**: Download PDF is the existing, working action of feature `004`. The editor header and the full-screen preview MUST reuse it as it is (enabled for a completed CV, pending edits saved first, busy state, failure message); this feature MUST NOT redesign or reimplement the export, change its API contract beyond what draft version 2 requires, add PDF features or templates, or add a dependency for it.
- **FR-020**: The PDF export MUST keep working with draft version 2: skills appear under the Skills heading grouped by category in saved order, each as `<category name>: <skills separated by " · ">` (a draft whose only category is the default `Skills` shows the skills without that label, so migrated CVs read as before); a draft without skills shows no Skills heading; Cyrillic and accented text stays selectable; headings are never left alone at the bottom of a page; the maximum draft (12 categories, 60 skills) exports without clipped or dropped content; and a CV migrated from version 1 exports with all its skills.
- **FR-019**: The feature MUST be delivered in iterations, one per story or frame group, each verified against the matching Figma frames at desktop and phone widths before the next starts.

### Key Entities *(include if feature involves data)*

- **CV draft**: the structured content of a CV (also the only input of the PDF export); changes here: skills become an ordered list of **skill categories** instead of a flat list, and the draft's `schemaVersion` becomes 2 (only that version is supported after the migration).
- **Skill category**: a named, ordered group of skills inside a draft (name unique within the CV).
- **Target role**: the role the CV is written for; stored with the CV, editable, shown in My CVs, the editor header and the preview.
- **Clarification question**: unchanged from `003` (unanswered, answered, applied, dismissed).
- **Completeness**: a derived score and a list of missing items; not stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of tested cases every section's edits (including entry add/remove, links, target role and skill categories) are present after a reload and from a second session.
- **SC-002**: A user can add five skills across two categories, using typing and suggestions, in under 60 seconds.
- **SC-003**: 0 tested saves report Saved without being stored; 100% of tested failures and conflicts keep the user's local text and offer a way to retry or review.
- **SC-004**: The editor, the combobox list and the full-screen preview work at 320 px with no horizontal scrolling, and each iteration's screens match their Figma frames in structure, spacing and states at desktop and phone width.
- **SC-005**: After the migration, 100% of tested pre-existing CVs (including ones with empty skills) open with all their skills visible and no data loss, already-version-2 drafts are byte-for-byte unchanged by it, and it gives the same result on a clean database, a database with `002`/`003` drafts, and a second run.
- **SC-006**: The generation prompt and the apply patch contain the rule that no skill is added unless the source or the user's answer states it, and the automated suite makes 0 real AI requests. Real-model compliance with that rule is not mechanically verified; it is checked only by the manual smoke test and the user's review, and this limit is documented in the README.
- **SC-007**: 0 cases in tests where a user can edit another user's target role, skills or any other CV content.
- **SC-008**: After the migration, 100% of tested pre-existing CVs (with skills and with none) and of CVs with several categories, including a Cyrillic custom category name, download a valid A4 PDF whose text is selectable and contains all their skills with the category names preserved, with no clipped text and no orphaned heading.

## Assumptions

- This feature builds on `003` (branch `005-structured-cv-editor` starts from `003-cv-editor-my-cvs`); feature `004` (PDF export) is implemented and was merged into this branch (`origin/004-pdf-export`), so Download PDF is a working action and feature numbering stays as is (`005` for this feature).
- The "Improve with AI" action is out of scope and not shown (user decision), because the product's AI is additive and scoped.
- The target role becomes editable through the existing draft save operation (user decision, recommended default); it keeps the existing length limit.
- Skills grouped by category is the user's decision, based on reference screenshots (category card with drag handle, searchable category list, skill input with Add, suggestion chips, "No items added", "Add skills"). Predefined categories are the fixed list in the appendix (taken from the user's reference screenshots, in that order); custom names are allowed.
- The draft shape change is versioned (`schemaVersion` 2); the migrated default category is named "Skills" and is editable by the user.
- The completeness score is advisory only; its formula is fixed in the appendix.
- The preview template stays the single "Classic · A4" template; zoom and full-screen are display-only and not stored.
- The two frames showing a flat skills list (05.2, 05.3) are treated as design inconsistencies, not as a requirement for a flat list.
- A stray icon button in the experience card (frame 05.1, next to **+ Add bullet**) is treated as the remove-entry action.

### Out of Scope

- New PDF features, multiple PDF templates or template switching, changes to the `004` PDF API contract beyond draft version 2 compatibility, version history, collaboration, public sharing (PDF export itself exists, see `004`).
- AI rewriting of the summary or any other existing text ("Improve with AI"), AI-suggested skills ("Suggest skills" is not an AI action in this feature).
- Drag-and-drop reordering, per-section conflict resolution or automatic merging, rich-text editing.

## Appendix: Predefined skill categories and suggested skills

The category list is copied from the user's reference screenshots, in the order shown. Each category has 4 to 6 suggested skills: a fixed convenience list shown as `+ Skill` chips under the skill input (FR-009), never stored until the user taps one. Suggestions are examples of common skills for the category, not claims about the user.

**Open check**: the screenshots show the list in scrolled slices, so a few entries between slices may be hidden. Suspected gaps: between *Testing & Quality Assurance* and *Security & Privacy*, between *Customer Support Tools* and *Leadership*, between *Human Resources & People Operations* and *Training, Learning & Enablement*, and between *Operations & Project / Program Management* and *Finance*. The user confirms or supplies the missing names; the list is data and is extended without changing behaviour.

| # | Category | Suggested skills |
|---|----------|------------------|
| 1 | Programming Languages | Python, JavaScript / TypeScript, Java, C#, Go, SQL |
| 2 | Frameworks | React, Vue, Angular, Node.js, NestJS, Django |
| 3 | Databases | PostgreSQL, MySQL, MongoDB, Redis, SQLite, Elasticsearch |
| 4 | Data & Analytics | SQL, Excel, Tableau, Power BI, dbt, Data modelling |
| 5 | AI & Machine Learning | Machine learning, PyTorch, TensorFlow, NLP, Prompt engineering, MLOps |
| 6 | Cloud & Infrastructure | AWS, Azure, Google Cloud, Terraform, Kubernetes, Linux |
| 7 | DevOps & CI/CD | Docker, GitHub Actions, GitLab CI, Jenkins, Monitoring, Infrastructure as code |
| 8 | Architecture & System Design | Microservices, REST API design, Event-driven architecture, Domain-driven design, Scalability, System design |
| 9 | Testing & Quality Assurance | Unit testing, Integration testing, Test automation, Playwright, Jest, Test planning |
| 10 | Security & Privacy | OWASP, Authentication & authorization, Encryption, GDPR, Threat modelling, Penetration testing |
| 11 | Mobile Development | React Native, Swift, Kotlin, Flutter, iOS, Android |
| 12 | Frontend Specialization | HTML & CSS, Accessibility, Responsive design, Web performance, Design systems, State management |
| 13 | IT Support Tools | Active Directory, Microsoft 365, ServiceNow, Jira Service Management, Remote support, Ticketing |
| 14 | Customer Support Tools | Zendesk, Intercom, Freshdesk, Salesforce Service Cloud, Live chat, Knowledge base |
| 15 | Leadership | Team leadership, Coaching & mentoring, Decision making, Delegation, Strategic planning, Stakeholder management |
| 16 | Analytical & Problem-Solving | Root cause analysis, Critical thinking, Data-driven decisions, Research, Troubleshooting, Process improvement |
| 17 | Communication | Written communication, Public speaking, Presentations, Active listening, Negotiation, Technical writing |
| 18 | Collaboration | Cross-functional teamwork, Agile ceremonies, Pair programming, Code review, Remote collaboration, Conflict resolution |
| 19 | Human Resources & People Operations | Recruiting, Onboarding, Performance management, HRIS, Employee relations, Compensation & benefits |
| 20 | Training, Learning & Enablement | Curriculum design, Workshop facilitation, Onboarding programs, E-learning, Mentoring, Instructional design |
| 21 | Marketing | SEO, Content marketing, Google Analytics, Email marketing, Social media, Campaign management |
| 22 | Creative Skills | Copywriting, Storytelling, Photography, Video editing, Illustration, Brand voice |
| 23 | Entrepreneurship & Business Ownership | Business planning, Fundraising, Go-to-market, Budgeting, Vendor management, Business development |
| 24 | Operations & Project / Program Management | Project planning, Scrum, Kanban, Risk management, Budget tracking, Jira |
| 25 | Finance | Financial modelling, Budgeting & forecasting, Financial reporting, Accounting, Excel, Cost analysis |
| 26 | Product, UX & Customer Experience | Product roadmapping, User research, Wireframing, A/B testing, Customer journey mapping, Usability testing |
| 27 | Sales & Customer Success | Lead generation, Account management, CRM, Negotiation, Customer onboarding, Retention |
| 28 | Compliance, Ethics & Risk | Regulatory compliance, Risk assessment, Internal audit, Policy writing, Data protection, Due diligence |
| 29 | Legal, Contracts & Governance | Contract drafting, Contract review, Corporate governance, Legal research, IP basics, Policy management |
| 30 | Procurement, Supply Chain & Logistics | Vendor sourcing, Inventory management, Logistics planning, Demand forecasting, Supplier negotiation, ERP |
| 31 | Public Sector, NGOs & International Orgs | Grant writing, Policy analysis, Stakeholder engagement, Program monitoring & evaluation, Fundraising, Advocacy |
| 32 | Change, Transformation & Turnaround | Change management, Process redesign, Stakeholder alignment, Transformation roadmaps, Cost optimisation, Post-merger integration |
| 33 | Ethics, Trust & Corporate Responsibility | Responsible AI, ESG reporting, Code of conduct, Whistleblowing processes, Sustainability, Stakeholder trust |
| 34 | Certifications & Methodologies | PMP, Scrum Master (PSM), ITIL, Six Sigma, AWS Certified, Agile / SAFe |
| 35 | Design | Visual design, Typography, Interaction design, Prototyping, Brand design, Layout |
| 36 | Design tools | Figma, Sketch, Adobe Photoshop, Adobe Illustrator, Adobe XD, Miro |

## Appendix: Completeness score

The score is the sum of the weights of the items that are satisfied by the current local draft; the missing items are listed with their weights (`+N% Item`). It is advisory and never blocks saving.

| Item | Satisfied when | Weight |
|------|----------------|--------|
| Full name | Not blank | 15% |
| Email | Not blank and a valid address | 10% |
| Phone | Not blank | 10% |
| Location | Not blank | 5% |
| LinkedIn | A LinkedIn link is present | 5% |
| Professional summary | Not blank | 15% |
| Experience | At least one entry with a title, a company and a start date | 25% |
| Education | At least one entry with an institution | 5% |
| Skills | At least 5 skills in total | 10% |

For the design's example (phone and LinkedIn missing) the score is 85% and the card reads "Needs details · 2 left".
