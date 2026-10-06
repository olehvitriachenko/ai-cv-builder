# Feature Specification: Optional CV sections (Languages, Certifications, Portfolio, Hobbies, Custom)

**Feature Branch**: `007-optional-cv-sections` (not created yet: it starts after 006 is settled, see Assumptions)

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "Plan adding such a field (Languages) — it adds new sections, but it is important." with the Figma "Add a section" card (node `112:4845`, phone `112:4884`, narrow `112:4920`) and the design page.

## Context

Today a CV has five parts: contact details, professional summary, professional experience, education, and skills in categories. A person who speaks several languages, holds certificates, has a portfolio of projects or wants to list hobbies has nowhere to put it, apart from a skill category with a made-up name.

The design adds one card, **Add a section** ("Extend your CV with optional sections. Only add what you can confirm."), with four options — **Certifications**, **Languages**, **Hobbies**, **Portfolio** — and a **+ Custom Section** action. The design shows only this card; how each section looks once added is not designed, so this specification defines it and the choices are recorded under Assumptions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add the Languages section and see it in the CV (Priority: P1)

A person opens a CV in the editor, finds the **Add a section** card under the other sections, presses **Languages** and gets a Languages card in the editor. They add "English — Fluent" and "Ukrainian — Native". The preview shows a Languages block, the downloaded PDF contains it, and it is still there after a reload or on another device.

**Why this priority**: This is the question that started the feature, and it carries everything the other sections reuse: the card, adding and removing a section, saving, the preview and the PDF. Without it nothing else is visible.

**Independent Test**: Open a completed CV, press Languages in the Add a section card, add two languages, check the preview, download the PDF, reload the page.

**Acceptance Scenarios**:

1. **Given** a CV in the editor, **When** the person looks under the existing sections, **Then** an **Add a section** card shows the title, the line "Extend your CV with optional sections. Only add what you can confirm.", the four options and **+ Custom Section**.
2. **Given** the card, **When** the person presses **Languages**, **Then** a Languages card appears in the editor, focus moves to its first field, and the **Languages** option is no longer offered.
3. **Given** a Languages card, **When** the person adds a language with a level and another without, **Then** the preview and the PDF list both, the one without a level showing just the name.
4. **Given** a saved Languages section, **When** the person reloads or opens the CV on another device, **Then** it is there unchanged.
5. **Given** a Languages card with entries, **When** the person removes the section, **Then** they are asked to confirm first, and after confirming the section disappears from the editor, the preview and the PDF and **Languages** is offered again.
6. **Given** a Languages card with no entry, **When** the person removes it, **Then** it disappears at once without a question.
7. **Given** a CV with no optional section, **When** it is previewed or downloaded, **Then** it looks exactly as before this feature.

---

### User Story 2 - Add Certifications, Portfolio and Hobbies (Priority: P2)

The same flow for the other three predefined sections. **Certifications** lists a name, an issuer, a date and an optional link. **Portfolio** lists projects with a link and a short description. **Hobbies** lists short items.

**Why this priority**: They complete the card the design shows, and each is a small variation on the P1 flow.

**Independent Test**: Add each section with one or two entries and check the editor, the preview and the PDF.

**Acceptance Scenarios**:

1. **Given** the Add a section card, **When** the person presses **Certifications**, **Then** a card appears where they can add entries with a name (required), an issuer, a month and year chosen with the date picker, and a link.
2. **Given** a certification with a link, **When** the link is not a valid web address, **Then** the field shows a message and the CV does not save that value, as for the existing link fields.
3. **Given** the card, **When** the person presses **Portfolio**, **Then** a card appears where they can add projects with a name (required), a link and a description of up to 300 characters; the existing "Portfolio" link among the contact details stays as it is.
4. **Given** the card, **When** the person presses **Hobbies**, **Then** a card appears where they can add short items one by one; the preview shows them on one line separated by dots.
5. **Given** all four predefined sections are added, **Then** the card offers only **+ Custom Section**.

---

### User Story 3 - Add a custom section (Priority: P2)

A person presses **+ Custom Section**, gives it a title ("Volunteering", "Publications") and writes its content.

**Why this priority**: The design offers it, and it covers everything the four predefined sections do not.

**Independent Test**: Add a custom section with a title and a few lines, check the preview and the PDF, remove it.

**Acceptance Scenarios**:

1. **Given** the card, **When** the person presses **+ Custom Section**, **Then** a card appears with a title field and a content field, and focus moves to the title.
2. **Given** a custom section with a title and content, **Then** the preview and the PDF show the title as a section heading and the content under it, with line breaks kept.
3. **Given** a custom section with content but no title, **Then** the title field asks for one and the section is not saved until it has a title.
4. **Given** three custom sections exist, **Then** **+ Custom Section** is no longer offered, and removing one offers it again.

---

### User Story 4 - Generation fills these sections from the source (Priority: P3)

When the person's pasted text or uploaded PDF clearly contains languages, certifications, projects or hobbies, the generated CV already holds them in the matching sections, using only what the source says. When the source is vague (for example "speaks German" with no level), the AI assistant asks instead of guessing.

**Why this priority**: It saves typing but is not needed to use the sections; everything in P1–P3 works with manual entry alone, so it can be delivered last.

**Independent Test**: Generate a CV from a source that lists languages with levels and one language without a level; check the sections and the question.

**Acceptance Scenarios**:

1. **Given** a source that lists "English (C1), Ukrainian (native)", **When** the CV is generated, **Then** the Languages section holds both with levels taken from the source wording.
2. **Given** a source that says only "German", **When** the CV is generated, **Then** the language is listed without a level and a clarification question asks for it; no level is invented.
3. **Given** a source with no such information, **When** the CV is generated, **Then** no optional section is created and no question about them is asked.
4. **Given** a source containing an instruction aimed at the AI inside a certifications list, **Then** it is treated as data, as for the rest of the source.
5. **Given** a clarification answer about a language level, **When** the person applies it, **Then** only that language entry changes.

---

### Edge Cases

- The same language twice: the second entry is flagged as a duplicate and is not saved until it is changed or removed.
- Too many entries: the editor stops offering "add" at the limit and says why (limits under Requirements).
- An entry with no required field (a language with no name): it is not saved and the field says what is missing; the rest of the CV still saves.
- A section added but left empty: it stays in the editor, but it is not saved and does not appear in the preview or the PDF.
- Two tabs or devices edit the same CV: the existing save-conflict flow applies, and the conflict review shows the optional sections too, the person choosing a whole version as before.
- A very long title, name or description: the field enforces its limit and the PDF wraps text without cutting it.
- A CV saved before this feature: opens, edits and downloads exactly as before, with all four options offered.
- Narrow screens: the options stack one per row at phone width, and nothing scrolls sideways at 320 px.
- The page-count estimate in the preview and the real PDF pagination include the new sections.
- A person who adds a section and then deletes the whole CV: the sections go with it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The editor MUST show an **Add a section** card below the existing sections, as designed: the title, the line "Extend your CV with optional sections. Only add what you can confirm.", the options **Certifications**, **Languages**, **Hobbies**, **Portfolio** each with a plus mark, and **+ Custom Section**; two options per row from the card's design width, one per row on a phone.
- **FR-002**: Pressing a predefined option MUST add that section to the CV once; an added section MUST NOT be offered again until it is removed. When all four are added the card MUST offer only **+ Custom Section**; when nothing is left to offer the card MUST disappear.
- **FR-003**: A new section card MUST take focus on its first field and MUST be announced to assistive technology.
- **FR-004**: **Languages** MUST hold entries of a name (required, up to 60 characters) and an optional level chosen from: Native, Fluent, Advanced, Intermediate, Basic; up to 12 entries; names unique ignoring case.
- **FR-005**: **Certifications** MUST hold entries of a name (required, up to 120 characters), an optional issuer (up to 120), an optional month and year chosen with the date picker (not in the future) and an optional link; up to 15 entries.
- **FR-006**: **Portfolio** MUST hold entries of a project name (required, up to 120 characters), an optional link and an optional description (up to 300 characters); up to 8 entries.
- **FR-007**: **Hobbies** MUST hold up to 15 short items of up to 60 characters each, added and removed one by one.
- **FR-008**: A **custom section** MUST hold a title (required, up to 60 characters) and content (up to 1,200 characters, line breaks kept); up to 3 custom sections.
- **FR-009**: Every link in these sections MUST follow the rule of the existing link fields (a web address, validated in the editor and again when saving).
- **FR-010**: Removing a section MUST ask for confirmation when it holds an entry and MUST be immediate when it is empty; removing a single entry is immediate. Removed sections MUST be offered again.
- **FR-011**: Sections MUST be saved with the CV through the existing autosave, with the same save states, the same conflict handling and the same validation on the server as the existing fields; an empty section MUST NOT be saved.
- **FR-012**: The preview MUST show the sections as part of the A4 document, after Skills, in this fixed order: Certifications, Languages, Portfolio, Hobbies, then custom sections in the order they were added; a section without entries MUST NOT appear.
- **FR-013**: The downloaded PDF MUST contain the same sections with the same content and order as the preview, as selectable text on A4, built from the saved CV.
- **FR-014**: CVs saved before this feature MUST open, edit, preview and download unchanged, and the sections MUST be available on them.
- **FR-015**: These sections MUST be readable and editable only by the owner of the CV, like every other part of it, for every operation including download.
- **FR-016**: The completeness score MUST NOT change because of these sections; they are optional and never block saving or downloading.
- **FR-017**: At generation, the AI MUST fill these sections only with facts the source states, MUST NOT invent levels, issuers, dates, links, projects or items, MUST ask a clarification question when a needed value is missing or ambiguous, and MUST create no section the source does not mention.
- **FR-018**: Whatever the AI returns for these sections MUST be validated against the same limits and rules as manual entry before it is saved; invalid output MUST fail the generation as it does today.
- **FR-019**: A clarification answer about one of these entries MUST change only that entry.
- **FR-020**: The card, the section cards and the new fields MUST follow the existing design language (field, date picker, remove, confirm patterns), work at 320 px without horizontal scrolling, and be usable with a keyboard and a screen reader with visible labels and focus.

### Key Entities

- **Optional section**: a part of the CV the person chooses to add. It has a kind (certifications, languages, portfolio, hobbies, custom) and entries. A CV holds at most one section of each predefined kind and up to three custom ones. It belongs to the CV and so to its owner.
- **Language entry**: a language and, optionally, the level at which the person speaks it.
- **Certification entry**: a certificate with its issuer, month and year and an optional link.
- **Portfolio entry**: a project with an optional link and a short description.
- **Hobby**: one short item.
- **Custom section**: a person-chosen title with free text content.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person can add the Languages section and enter two languages in under 1 minute, without leaving the editor.
- **SC-002**: In 100% of checked CVs, the sections in the downloaded PDF match the preview word for word and in the same order.
- **SC-003**: 100% of CVs created before this feature open, preview and download exactly as they did before it.
- **SC-004**: After a reload, or opening the CV on another device, 100% of the saved sections and entries are present and unchanged.
- **SC-005**: Over the checked generation sources, 0 values in these sections are absent from the source, and 100% of missing levels or dates produce a clarification question instead of a guess.
- **SC-006**: Every new screen state fits a 320 px wide screen with no horizontal scrolling and every control reachable by keyboard.

## Assumptions

- The Figma design provides only the **Add a section** card (design width, phone width and a narrow variant). The content of the sections, their fields, limits and levels in this specification are defaults chosen to be consistent with the rest of the editor; the person who owns the design may replace them and the specification will follow.
- "Portfolio" in the card is a list of projects (the plus mark in the design is named "Projects"). The contact details keep their own single "Portfolio" link; the two do not replace each other.
- Sections have a fixed place in the document and cannot be reordered; the person cannot reorder the predefined sections, only choose which exist. Reordering is out of scope.
- Language levels are plain words, not an exam scale; the person who needs "C1" can say it in the language name or in a custom section.
- A certification has one date (when it was obtained); an expiry date is out of scope.
- The completeness score is left alone because it is advisory and these sections are optional.
- Generation (Story 4) is delivered last and separately: the first three stories work completely by manual entry, and the AI does not need to know about the sections until Story 4.
- Existing rules continue to apply without change: ownership on the server, saves with a revision and conflicts, server-side validation of everything stored, the AI never inventing facts, and the CV staying editable by the person.
- This work starts after feature 006 (submission readiness) is settled; it needs its own branch and its own plan, including how stored CVs are carried to the new shape, which belongs to planning and not here.
- Out of scope: reordering sections, more than three custom sections, rich text, expiry dates, skill levels, social links and any section not shown in the design.
