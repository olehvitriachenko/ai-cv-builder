# AI CV Builder Constitution

## Purpose

AI CV Builder is a time-boxed full-stack engineering project.

The product allows an authenticated user to create and manage CVs from either an uploaded PDF or
free-form background information, provide a target role, generate a structured CV with AI
assistance, clarify missing information, edit the result manually, and export it as a PDF.

The project is evaluated not only by whether the product works, but also by the quality of its
architecture, reliability, handling of failures and untrusted input, trade-offs made under the
time constraint, and the developer's ability to understand and own AI-generated code.

This constitution defines the highest-level engineering and product principles for the
repository. Detailed implementation rules belong in repository-specific instructions and feature
specifications.

## Core Principles

### I. Product Contract Is Non-Negotiable

The implementation MUST preserve the core product behavior defined by the test task.

A signed-in user MUST be able to:

- register and log in using email and password;
- create and manage persisted CVs;
- provide either:
  - a PDF CV, or
  - free-form background information;
- provide a target role;
- generate a structured CV draft;
- review generated content;
- answer clarification questions;
- manually edit CV content;
- return later and access persisted CVs;
- export the final CV as an A4 PDF with selectable text.

The generated CV MUST support the following core information:

- contact details;
- professional summary;
- experience;
- education;
- skills.

The generated summary SHOULD be relevant to the target role.

Relevant experience SHOULD be prioritized over less relevant experience.

The product MUST remain usable on mobile devices.

The implementation MUST NOT silently remove or materially change these product capabilities
without an explicit specification change.

The source task explicitly requires PDF/free-text input, target-role-driven generation, editable
structured CV content, persistent CV access, mobile usability, and selectable-text A4 export.

### II. Strict Type Safety

Type safety is a non-negotiable engineering requirement.

The project MUST use strict TypeScript.

The codebase MUST NOT use:

- `any`;
- implicit `any`;
- `@ts-ignore`;
- weakened compiler settings introduced only to bypass type errors.

Untrusted or externally sourced data SHOULD initially be represented as `unknown` and narrowed
explicitly.

Static TypeScript types MUST NOT be treated as runtime validation.

Runtime validation MUST be applied at external trust boundaries.

These boundaries include, where applicable:

- HTTP input;
- cookies;
- uploaded files;
- parsed PDF content;
- environment configuration;
- database JSON;
- third-party responses;
- LLM output.

Type assertions MUST NOT be used as a substitute for validation.

### III. Reliability Over Feature Breadth

Reliability, correctness, and recoverability are more important than the number of implemented
features.

If the project cannot complete all desirable functionality within the available time, scope MUST
be reduced rather than weakening critical behavior.

Long-running work MUST NOT depend on:

- a browser tab remaining open;
- an HTTP request remaining connected;
- temporary client-side state.

CV generation MUST persist its progress.

Reloading the page MUST NOT lose generation work.

Failures MUST result in explicit, understandable system state rather than silent corruption or
indefinite loading.

The task explicitly states that generation may take time, page reloads must not lose work, and
features should be cut before reliability is sacrificed.

### IV. Explicit and Recoverable Generation Lifecycle

Asynchronous CV generation MUST use a persistent lifecycle.

The system SHOULD model generation with explicit states such as:

- `PENDING`
- `PROCESSING`
- `COMPLETED`
- `FAILED`

State transitions MUST be explicit and testable.

A failed generation MUST NOT remain permanently indistinguishable from active processing.

The system SHOULD provide enough persistent information to:

- detect failed work;
- understand current status;
- retry safely where appropriate;
- avoid unnecessary duplicate processing.

The simplest reliable mechanism SHOULD be preferred over introducing distributed infrastructure
prematurely.

### V. Secure Authentication and Resource Ownership

Authentication and authorization MUST be enforced on the server.

Authentication MUST use email and password, as required by the product scope.

Authentication credentials MUST be handled securely and MUST NOT be exposed to client-side
JavaScript.

Authentication credentials MUST NOT be stored in:

- `localStorage`;
- `sessionStorage`;
- client-readable authentication cookies.

Passwords MUST never be stored in plaintext.

Every user-owned CV operation MUST enforce ownership.

A user MUST NOT be able to access or mutate another user's CV through:

- direct resource IDs;
- modified request parameters;
- client-side manipulation;
- export endpoints;
- generation endpoints;
- clarification endpoints.

Authenticated identity MUST come from validated server-side authentication context.

Client-provided `userId` values MUST NOT be trusted for ownership decisions.

Frontend visibility controls MUST NOT be treated as authorization.

The task explicitly requires that users may only see and change their own CVs.

### VI. AI Must Transform Facts, Never Invent Them

All LLM output is untrusted.

The AI MAY:

- rephrase supplied information;
- summarize supplied information;
- restructure supplied information;
- improve wording;
- reorder content;
- prioritize information relevant to the target role.

The AI MUST NOT invent facts.

It MUST NOT fabricate missing information such as:

- employment dates;
- employers;
- job titles;
- technologies;
- responsibilities;
- metrics;
- education;
- certifications;
- contact information.

When information is missing, vague, or ambiguous, the system MUST create a clarification question
rather than fabricate a value.

A user's clarification answer SHOULD update the relevant portion of the CV.

This behavior is part of the product contract, not an optional enhancement. The source task
explicitly permits rephrasing and restructuring while prohibiting invented facts and requiring
clarification questions for missing or vague information.

### VII. Structured AI Output Must Be Validated

LLM responses MUST NOT be persisted directly into domain data.

The conceptual boundary MUST be:

`source data -> prompt -> Anthropic -> structured output -> runtime validation -> domain
validation -> persistence`

Structured LLM output MUST be validated before it can affect persisted CV state.

Validation failure MUST result in a controlled failure or retry path.

The implementation MUST NOT use unsafe casts to force malformed AI output into application types.

Prompt instructions alone MUST NOT be treated as sufficient validation.

All LLM calls MUST use Anthropic models, as required by the task.

### VIII. Server-First Product Architecture

The application SHOULD prefer server-side execution where it reduces complexity and improves
reliability.

For the frontend:

- Server Components SHOULD be the default.
- Client-side behavior SHOULD be introduced only when real interactivity requires it.
- Server data SHOULD be loaded server-side when practical.
- Client state SHOULD remain local unless a genuine shared-state requirement exists.

For the backend:

- the architecture SHOULD remain a modular monolith;
- business logic SHOULD remain separate from HTTP transport concerns;
- infrastructure concerns SHOULD remain behind clear boundaries.

The system MUST expose a REST API, as required by the task.

The project SHOULD avoid distributed-system complexity unless a concrete requirement justifies it.

### IX. Database Integrity and Persistent Ownership

Persistent application state MUST be protected by both application rules and database-level
guarantees where appropriate.

The project standardizes on PostgreSQL.

Schema evolution MUST be explicit and migration-based.

Important invariants SHOULD be enforced through appropriate database mechanisms such as:

- primary keys;
- foreign keys;
- unique constraints;
- non-null constraints.

Indexes SHOULD correspond to real query patterns rather than speculation.

Database structure SHOULD reflect the product model that:

- one user may own multiple CVs;
- CVs persist across devices and sessions;
- generation state persists independently of the browser.

The task permits PostgreSQL or SQLite; this project deliberately standardizes on PostgreSQL.

### X. Critical Behavior Must Be Tested

Automated testing MUST focus on behavior whose failure would create meaningful product, security,
or reliability risk.

High-priority areas include:

- registration;
- login;
- session validation;
- logout;
- authentication enforcement;
- authorization;
- CV ownership;
- cross-user access prevention;
- LLM structured-output validation;
- generation lifecycle;
- generation failure handling;
- clarification flow;
- critical data transformations;
- export ownership enforcement.

Bug fixes SHOULD include regression tests where practical.

Tests SHOULD verify observable behavior rather than implementation details.

Tests MUST NOT exist only to inflate coverage metrics.

External AI calls SHOULD be mocked in ordinary automated tests.

The task explicitly asks for tests covering the parts considered most important rather than
arbitrary maximum coverage.

### XI. The CV Remains User-Controlled

AI assistance MUST NOT remove user control over the final document.

Users MUST be able to manually edit generated CV content.

The UI SHOULD make the actual CV the primary object being edited rather than presenting the
entire experience as a generic administrative form.

The product SHOULD allow users to understand how their CV will appear when exported.

The exported document MUST:

- use A4 page size;
- contain selectable text;
- be derived from persisted CV data.

The task explicitly requires manual editing of any field and A4 PDF output with selectable text.

### XII. Simplicity Before Abstraction

The project is intentionally time-boxed.

The implementation SHOULD prefer the smallest solution that is:

- correct;
- reliable;
- understandable;
- testable;
- maintainable.

The project MUST avoid speculative complexity.

Infrastructure or architectural mechanisms MUST NOT be introduced merely because they may become
useful in a hypothetical future.

Examples of technologies that SHOULD NOT be introduced without demonstrated need include:

- microservices;
- Kafka;
- RabbitMQ;
- Redis;
- distributed queues;
- CQRS frameworks;
- event sourcing;
- additional global state libraries.

Abstraction SHOULD follow demonstrated repetition or domain need rather than anticipation.

### XIII. Scope Discipline

Out-of-scope functionality MUST NOT be implemented unless the specification explicitly changes.

The source task defines the following as out of scope:

- multiple CV templates;
- tailoring to a specific job description;
- OAuth;
- password reset;
- email verification;
- payments;
- admin panel.

Time spent on out-of-scope functionality MUST NOT compromise:

- correctness;
- reliability;
- tests;
- security;
- the required end-to-end flow.

If a required or desirable feature is intentionally simplified or omitted due to time
constraints, the decision SHOULD be documented.

### XIV. AI-Generated Code Must Be Owned, Not Merely Produced

AI coding tools may be used.

Generated code MUST remain understandable by the developer.

Before a change is considered complete, the developer or coding agent SHOULD:

1. inspect the implementation;
2. review the diff;
3. run relevant tests;
4. run type checking;
5. run linting where applicable;
6. verify compliance with the active specification;
7. understand non-obvious architectural decisions.

AI-generated code MUST NOT be accepted solely because it compiles.

Architectural trade-offs SHOULD be explainable.

This directly reflects the evaluation criterion that the developer must be able to review and own
AI-generated code rather than merely produce it.

### XV. Local Reproducibility Is Part of Correctness

The project MUST be reproducible locally.

The expected project delivery is a GitHub repository that can be run locally.

The application MUST support local startup through Docker Compose.

Deployment infrastructure is not part of the required scope.

Secrets MUST NOT be committed.

The Anthropic API key MUST be configurable through environment variables.

The source task explicitly states that deployment is not required and the project should run
locally with `docker compose up`, with `ANTHROPIC_API_KEY` supplied externally.

### XVI. Documentation Must Explain Decisions

The README MUST allow a reviewer to understand:

- how to run the application;
- how to run the tests;
- the architecture;
- major architectural decisions;
- how AI hallucination is prevented;
- what was simplified;
- what would be changed with more time;
- how AI coding tools were used.

Documentation SHOULD focus on meaningful decisions and trade-offs rather than restating obvious
code.

These README expectations are explicitly part of the required deliverables.

## Governance

This constitution is the highest-level engineering authority for the project.

The precedence order is:

1. Product requirements from the test task
2. This constitution
3. Active Spec Kit feature specification
4. Repository rules in `.claude/`
5. Implementation details

Repository rules MUST NOT contradict this constitution.

Feature specifications MUST NOT silently weaken these principles.

If a specification requires violating a constitutional principle, the conflict MUST be explicitly
identified and the constitution SHOULD be amended before implementation.

Changes to this constitution SHOULD be rare.

An amendment SHOULD include:

- what principle changed;
- why the change is necessary;
- what existing implementation or specification is affected.

Detailed implementation conventions SHOULD NOT be added to the constitution when they belong in
repository rules.

The constitution defines principles and product guarantees.

Repository rules define how those principles are implemented in this codebase.

Feature specifications define what is being built next.

### Versioning Policy

The constitution version follows semantic versioning:

- MAJOR: a principle is removed or redefined in a backward-incompatible way;
- MINOR: a principle or section is added, or guidance is materially expanded;
- PATCH: clarifications, wording, or typo fixes with no change in meaning.

### Compliance Review

Feature specifications, plans, and pull requests MUST be checked against this constitution.
Violations MUST be resolved or recorded as an explicit, justified exception before the work is
considered complete.

**Version**: 1.0.0 | **Ratified**: 2026-10-05 | **Last Amended**: 2026-10-05
