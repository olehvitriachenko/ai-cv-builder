# Feature Specification: Authentication and User-Owned CV Foundation

**Feature Branch**: `001-auth-user-cv-foundation`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Authentication and user-owned CV foundation — email/password registration and login, server-side sessions represented by a secure HTTP-only cookie, logout, server-side authentication enforcement, and a minimal CV record whose ownership is enforced on the server."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register an account (Priority: P1)

A visitor creates an account with an email address and a password so that their CVs can be stored privately and retrieved later from any device.

**Why this priority**: Without accounts there is no identity, and without identity there is nothing to own. Every other part of the product depends on this.

**Independent Test**: Submit the registration form with a new email and a valid password; the account exists and the user is signed in automatically (see FR-004). Submit again with the same email; registration is refused with a clear message.

**Acceptance Scenarios**:

1. **Given** a visitor with an email not yet registered, **When** they submit a valid email and a valid password, **Then** an account is created and the user is signed in automatically, receiving a session cookie as on sign-in (FR-004).
2. **Given** an email that is already registered, **When** a visitor registers with it again, **Then** registration fails, no second account is created, and the existing account is unaffected.
3. **Given** a visitor, **When** they submit a malformed email, a too-short password, or missing fields, **Then** registration is rejected with a clear message identifying each invalid field, and no account is created.
4. **Given** a registered account, **When** the stored data is inspected, **Then** the password is not present in readable form anywhere.
5. **Given** a visitor who registers with an email differing only in letter case or surrounding whitespace from an existing one, **When** they submit, **Then** it is treated as the same email and refused as a duplicate.

---

### User Story 2 - Sign in and stay signed in (Priority: P1)

A registered user signs in with their email and password and remains signed in across page reloads until they sign out or the session expires.

**Why this priority**: Sign-in is the gate to all protected functionality, and surviving a reload is a stated product requirement.

**Independent Test**: Sign in, reload the page, and confirm the app still recognises the user and the "current user" request returns their identity.

**Acceptance Scenarios**:

1. **Given** a registered user, **When** they sign in with the correct email and password, **Then** a server-side session is created and the browser receives a session cookie that client-side scripts cannot read.
2. **Given** a signed-in user, **When** they reload the page, **Then** they are still recognised as signed in without re-entering credentials.
3. **Given** a signed-in user, **When** the frontend asks for the current user, **Then** it receives that user's identity (and never their password or any credential material).
4. **Given** a registered email with a wrong password, **When** sign-in is attempted, **Then** it fails with a generic "invalid email or password" outcome.
5. **Given** an email that is not registered, **When** sign-in is attempted, **Then** the outcome is indistinguishable from the wrong-password case (same status, same message, same response shape).
6. **Given** a signed-in user, **When** browser storage is inspected, **Then** no authentication credential or session token is present in local or session storage.

---

### User Story 3 - Sign out (Priority: P1)

A signed-in user signs out, ending their session immediately and for good.

**Why this priority**: Users on shared or lost devices must be able to end access. Logout invalidation is a critical security behavior.

**Independent Test**: Sign in, capture the session cookie, sign out, then replay the captured cookie against a protected request; it must be rejected.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they sign out, **Then** their server-side session is invalidated and the session cookie is cleared from the browser.
2. **Given** a session that has been signed out, **When** its former cookie value is presented again, **Then** the request is rejected as unauthenticated.
3. **Given** a signed-in user on two devices, **When** they sign out on one, **Then** the other device's session remains valid.

---

### User Story 4 - Protected resources reject unauthenticated access (Priority: P1)

Any request to protected functionality without a valid session is refused by the server, regardless of what the frontend displays.

**Why this priority**: Authentication that is enforced only in the UI is not authentication. This is the foundation every later feature relies on.

**Independent Test**: Call every protected operation with no cookie, a garbage cookie, an expired session, and a signed-out session; every call is refused with the same unauthenticated outcome.

**Acceptance Scenarios**:

1. **Given** no session cookie, **When** a protected operation is requested, **Then** the server responds with HTTP 401.
2. **Given** a cookie that is malformed, unknown, expired, or belongs to an invalidated session, **When** a protected operation is requested, **Then** the server responds with HTTP 401, identical in shape to the no-cookie case.
3. **Given** a session whose lifetime has elapsed, **When** it is used, **Then** it is rejected even though it was valid earlier.
4. **Given** an unauthenticated visitor opens a page intended for signed-in users, **When** the page loads, **Then** they are guided to sign in — this is a convenience only and does not replace server enforcement.

---

### User Story 5 - Own CVs and only own CVs (Priority: P1)

A signed-in user can create a CV record that belongs to them and read it back. No other user can read it, no matter what identifiers they supply.

**Why this priority**: Per-user ownership is an explicit product requirement and a critical security boundary; the later editor, generation, clarification and export features all inherit these rules.

**Independent Test**: User A creates a CV and reads it back. User B requests User A's CV by its ID and is refused in the same way as for a CV that does not exist.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they create a CV (optionally with a target role), **Then** a CV is stored with a unique ID, that user as its owner, and created/updated timestamps.
2. **Given** a CV owned by User A, **When** User A requests it by ID, **Then** it is returned.
3. **Given** a CV owned by User A, **When** signed-in User B requests it by ID, **Then** the response is the same as for a non-existent CV and reveals nothing about the CV.
4. **Given** a signed-in user, **When** they include a `userId` (or any owner-like field) in a request body, query parameter, or route parameter, **Then** it is ignored or rejected and never changes whose identity or ownership applies.
5. **Given** a CV is created, **When** it is stored, **Then** its owner is always the authenticated user from the session, never a value supplied by the client.
6. **Given** no valid session, **When** CV creation or retrieval is attempted, **Then** the server responds with HTTP 401.

---

### User Story 6 - Simple, mobile-friendly sign-up and sign-in screens (Priority: P2)

Visitors use two simple screens, one to register and one to sign in, that work comfortably on a phone and explain problems clearly without leaking sensitive detail.

**Why this priority**: The behavior works through the API without the screens, but the product is unusable for real users without them, and mobile usability is a constitutional requirement.

**Independent Test**: On a phone-width viewport, register, sign out, and sign in using only the screens; trigger a validation error and an invalid-credentials error and read the messages.

**Acceptance Scenarios**:

1. **Given** a phone-width viewport, **When** the registration or sign-in screen is shown, **Then** all fields and actions are usable without horizontal scrolling or zooming.
2. **Given** invalid registration input, **When** the form is submitted, **Then** each problem is shown next to the relevant field in plain language.
3. **Given** wrong credentials, **When** sign-in is submitted, **Then** one generic message is shown and no hint reveals whether the email exists.
4. **Given** a duplicate-email registration, **When** it is submitted, **Then** a clear message says the email cannot be used to register.
5. **Given** a signed-in user, **When** they view the minimal signed-in view, **Then** it shows who they are and offers a sign-out control (see Assumptions).
6. **Given** an unexpected server failure, **When** it happens during these flows, **Then** the user sees a generic failure message with no technical or security-sensitive detail.

---

### Edge Cases

- Registration or sign-in with an email that differs from an existing one only by letter case or surrounding whitespace.
- A password at the minimum boundary, one character below it, and at and above the maximum length boundary.
- A very long email or password intended to stress the system.
- Registration submitted twice in rapid succession with the same new email: exactly one account results and the other attempt fails cleanly.
- Request bodies that are empty, not valid JSON, have wrong field types, or contain unexpected extra fields.
- Sign-in attempted while already signed in (the new sign-in replaces or adds a session without leaving the user in an inconsistent state).
- Sign-out requested without a valid session (it must not error in a way that leaks anything; see Assumptions).
- A session that expires while the user has a page open: the next protected request is refused with 401 and the UI returns the user to sign-in.
- A CV ID that is syntactically malformed, versus one that is well-formed but does not exist or belongs to someone else.
- A client sends another user's ID in the body, query string, route, or a custom header while requesting its own or another's CV.
- A user's session is valid but the user record no longer exists (treated as unauthenticated).
- Database or hashing failure during registration or sign-in: the user receives a generic failure, no partial account or session is left behind, and nothing sensitive is logged.

## Requirements *(mandatory)*

### Functional Requirements

#### Registration

- **FR-001**: Users MUST be able to register with an email address and a password.
- **FR-002**: Email addresses MUST be unique across accounts. Uniqueness MUST be evaluated on a normalised form (surrounding whitespace removed, letter case ignored) and MUST hold even under concurrent registration attempts.
- **FR-003**: Passwords MUST never be stored, logged, or returned in plaintext. Only a salted, slow, purpose-built password hash MAY be persisted.
- **FR-004**: After successful registration, the user MUST be signed in automatically: a server-side session is created and the session cookie is delivered exactly as for sign-in (FR-010), so no separate sign-in step is needed.
- **FR-005**: Registration input MUST be validated at runtime before reaching business logic: the email MUST be a syntactically valid address within a reasonable maximum length, and the password MUST meet the length rules in Assumptions.
- **FR-006**: Invalid registration input MUST be rejected with field-level, human-readable errors and MUST NOT create an account.
- **FR-007**: Registration with an already-registered email MUST fail cleanly with a conflict outcome, create no second account, and leave the existing account unchanged.

#### Sign-in

- **FR-008**: A registered user MUST be able to sign in with their email and password.
- **FR-009**: A failed sign-in MUST NOT reveal whether the email or the password was wrong. Wrong-password and unknown-email outcomes MUST be indistinguishable in status, message, and response shape.
- **FR-010**: A successful sign-in MUST create a server-side session and deliver it to the browser through a cookie that client-side scripts cannot read.
- **FR-011**: Authentication credentials and session tokens MUST NOT be stored in browser local storage or session storage, or in any client-readable cookie.
- **FR-012**: Protection against repeated failed sign-in attempts (throttling or lockout) is NOT required by this feature. This is a known brute-force exposure and MUST be documented as a production follow-up.

#### Sessions

- **FR-013**: The server MUST identify the authenticated user solely from a valid server-side session. Client-supplied user IDs, in any location, MUST NEVER determine authentication identity.
- **FR-014**: A signed-in state MUST survive page reloads for as long as the session is valid.
- **FR-015**: Sessions MUST have a limited lifetime. Expired sessions MUST be rejected as unauthenticated.
- **FR-016**: Session tokens MUST be generated with a cryptographically secure source of randomness and MUST be unguessable.
- **FR-017**: Raw session tokens MUST NOT be persisted. Only a non-reversible representation of the token MAY be stored, so that a leak of stored session data does not yield usable credentials.
- **FR-018**: The system MUST expose an operation that returns the currently authenticated user's identity (non-sensitive fields only) so the frontend can establish signed-in state on load.
- **FR-019**: The session cookie MUST be HTTP-only, MUST be restricted from cross-site sending by default (same-site), MUST have an explicit expiry aligned with the session lifetime, and MUST be marked secure in production while remaining usable on plain local development.
- **FR-020**: A user MAY hold multiple concurrent sessions (e.g. several devices); each is independently valid and independently invalidated.

#### Sign-out

- **FR-021**: A signed-in user MUST be able to sign out.
- **FR-022**: Sign-out MUST invalidate the server-side session and clear the session cookie.
- **FR-023**: An invalidated session MUST NOT be reusable, even if its cookie value is replayed.
- **FR-024**: Sign-out MUST affect only the session it is performed on, not other sessions of the same user.

#### Authentication enforcement

- **FR-025**: Every protected operation MUST reject requests without a valid session with HTTP 401, and all causes (no cookie, malformed, unknown, expired, invalidated) MUST produce an identical outcome.
- **FR-026**: Authentication MUST be enforced on the server for every protected operation. Frontend route visibility or redirects are a convenience and MUST NOT be relied on as authorization.

#### CV ownership

- **FR-027**: Every CV MUST belong to exactly one user, set at creation from the authenticated session and immutable thereafter in this feature.
- **FR-028**: A user MUST be able to access only CVs they own. Ownership MUST be checked on the server for every CV operation.
- **FR-029**: A request for a CV the user does not own MUST yield exactly the same outcome as a request for a CV that does not exist, so that the existence of other users' CVs is not revealed.
- **FR-030**: Client-supplied `userId` or any owner-like field MUST NOT influence authentication identity or CV ownership, whether sent in the body, query, route, or headers. Such fields MUST be ignored or rejected.
- **FR-031**: Ownership rules established here MUST apply identically to future read, update, delete, generation, clarification-answer, and export operations; those features MUST reuse, not reimplement, this enforcement.
- **FR-032**: A user MUST be able to create a CV, optionally supplying a target role, and to retrieve a CV they own by its ID.

#### Validation, errors, and logging

- **FR-033**: All request inputs (bodies, route parameters, query parameters, and cookies) MUST be validated at runtime at the boundary. Invalid input MUST NOT reach business logic.
- **FR-034**: Errors MUST follow one consistent structure across all operations, using appropriate HTTP status codes, with field-level detail for validation errors only.
- **FR-035**: Error responses MUST NOT expose stack traces, database internals, hashes, tokens, or any other security-sensitive information.
- **FR-036**: Passwords, session tokens, cookie values, and password hashes MUST NOT appear in logs. Authentication events SHOULD be logged with non-sensitive context (event category, outcome) only.

#### Screens

- **FR-037**: The product MUST provide a registration screen and a sign-in screen that are simple, validate input with clear messages, show authentication errors without revealing sensitive information, and are fully usable on phone-width viewports.
- **FR-038**: The frontend MUST establish signed-in state by asking the server for the current user, not from client-stored credentials.

### Behavioral API Contract

The externally visible contract below defines the required behavior of each operation. Resource names are provided because the requested REST surface needs to be unambiguous; internal structure is intentionally left to planning.

| Operation | Request | Success | Failure outcomes |
|-----------|---------|---------|------------------|
| Register | `POST /auth/register` with email and password | `201` with the created user's identity (never the password or hash); session cookie set as for sign-in (FR-004) | `400` validation errors (field-level); `409` email already registered |
| Sign in | `POST /auth/login` with email and password | `200` with the user's identity; session cookie set | `400` malformed or invalid body; `401` invalid credentials (single generic outcome) |
| Sign out | `POST /auth/logout` | `204`; session invalidated; cookie cleared | Idempotent: without a valid session it still returns `204` and clears the cookie (see Assumptions) |
| Current user | `GET /auth/me` | `200` with the current user's identity | `401` unauthenticated |
| Create CV | `POST /cvs` with optional target role | `201` with the CV (ID, optional target role, timestamps) | `400` validation errors; `401` unauthenticated |
| Get CV | `GET /cvs/{id}` | `200` with the CV | `400` malformed ID; `401` unauthenticated; `404` not found **or** not owned (identical) |

### Key Entities *(include if feature involves data)*

- **User**: A registered person. Has a unique identifier, a unique normalised email, a password stored only as a non-reversible hash, and a creation timestamp. Owns zero or more CVs and may hold zero or more sessions.
- **Session**: A period of authenticated access for one user on one browser or device. Has a non-reversible representation of its secret token, the owning user, a creation time, an expiry time, and an invalidated state. The raw token exists only in the browser's cookie.
- **CV**: The minimal record that anchors ownership. Has a unique identifier, exactly one owning user, an optional target role, and created and updated timestamps. Content sections (contact details, summary, experience, education, skills) are out of scope here and will be added by later features.

### Required Automated Test Coverage

Tests MUST verify observable behavior (responses, persisted state, cookies), not implementation details, and MUST NOT depend on execution order or shared data. At minimum:

- **Registration**: success (including automatic sign-in: a session cookie is issued and the current-user request succeeds); duplicate email (including case/whitespace variants); invalid input (bad email, short password, missing fields, wrong types); password not stored in plaintext.
- **Sign-in**: success sets a session cookie; wrong password; unknown email; wrong-password and unknown-email outcomes are indistinguishable.
- **Current user**: authenticated request returns the user; unauthenticated request returns 401.
- **Sessions**: expired session rejected; malformed or unknown session rejected; the stored session secret is not the raw cookie value.
- **Sign-out**: success clears the cookie; the former session is rejected afterwards; another session of the same user remains valid.
- **Protected routes**: every protected operation returns 401 without a valid session.
- **CV ownership**: create a CV for the authenticated user; read own CV; reading another user's CV is indistinguishable from a non-existent CV; a client-supplied `userId` in body, query, or route cannot change identity or ownership; malformed CV ID is rejected.

Anthropic and other external services are not involved in this feature.

### Acceptance Criteria

- **AC-001**: A new visitor can register with a valid email and password, the account is persisted, and the visitor is signed in automatically.
- **AC-002**: A registered user can sign in with correct credentials and receives an HTTP-only session cookie; no credential or token is placed in local or session storage.
- **AC-003**: After a full page reload a signed-in user is still signed in and the current-user request returns their identity.
- **AC-004**: The current-user request returns the authenticated user's identity and no credential material.
- **AC-005**: A signed-in user can sign out; the response clears the cookie.
- **AC-006**: After sign-out, presenting the old cookie to any protected operation returns 401.
- **AC-007**: Requests with no, malformed, unknown, expired, or invalidated sessions to any protected operation return 401 with an identical response.
- **AC-008**: User B requesting User A's CV by ID receives the same response as for a non-existent CV, and no data from the CV.
- **AC-009**: Supplying a different `userId` in the body, query, route, or headers does not change the authenticated identity or the owner of any CV created or read.
- **AC-010**: Duplicate registration, invalid registration input, and invalid credentials each fail with the specified status, a clear non-sensitive message, and no side effects.
- **AC-011**: The registration and sign-in screens are usable at phone width and show clear errors per User Story 6.
- **AC-012**: All tests listed under Required Automated Test Coverage exist and pass.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can complete registration and reach a signed-in state in under 1 minute on a phone-sized screen.
- **SC-002**: 100% of requests to protected operations without a valid session are refused with 401, across no-cookie, malformed, expired, and signed-out cases.
- **SC-003**: Across all tested user pairs and request variants, 0 cases exist where one user can read, or learn the existence of, another user's CV.
- **SC-004**: 100% of tested page reloads while the session is valid keep the user signed in.
- **SC-005**: 100% of tested reuses of a signed-out session are rejected.
- **SC-006**: Wrong-password and unknown-email sign-in outcomes cannot be told apart from the response alone in 100% of tested cases.
- **SC-007**: Registration and sign-in screens are fully usable at a 320 px viewport width with no horizontal scrolling.
- **SC-008**: Inspection of stored data and logs after a full test run finds 0 plaintext passwords, 0 raw session tokens, and 0 password hashes in logs.
- **SC-009**: The complete required automated test suite passes, and tests are independent of each other and of execution order.

## Assumptions

- **Scope of CVs**: This feature includes only creating a CV (optionally with a target role) and retrieving a single CV the user owns. Listing a user's CVs, editing, deleting, and all CV content sections are deferred to later features, which must inherit the ownership rules above.
- **Not-owned vs. not-found**: Other users' CVs return the same "not found" outcome as non-existent ones, chosen to avoid revealing which IDs exist. The source description asks only that cross-user access "fail consistently".
- **Malformed CV ID**: A CV ID that is not a valid identifier is treated as invalid input (400), distinct from a well-formed ID that is not found or not owned.
- **Password policy**: Minimum 8 and maximum 128 characters, no composition rules. The maximum prevents resource abuse. No password strength meter or breached-password checks.
- **Email handling**: Emails are trimmed and compared case-insensitively. Verification of ownership of the email address is out of scope, so no confirmation is sent.
- **Duplicate-email disclosure**: Registration keeps the explicit "email is already registered" behavior for this take-home because there is no email verification flow. Account enumeration is a known production security trade-off and MUST be recorded as such in project documentation.
- **Session lifetime**: Sessions last 7 days from sign-in with a fixed expiry (no sliding renewal). The value is a default that planning may adjust without changing behavior.
- **Multiple sessions**: A user may be signed in on several devices at once. Sign-out ends only the current session. "Sign out everywhere" is out of scope.
- **Sign-out without a session**: Sign-out is idempotent. It returns success and clears the cookie even if no valid session is present, since there is nothing to protect and the end state is the desired one. It is therefore not treated as a protected operation for the 401 rule.
- **Target role**: Optional free text, trimmed. If supplied it must not be blank and has a reasonable maximum length (200 characters assumed).
- **Minimal signed-in view**: A bare-bones authenticated page showing the user's email and a sign-out control is included so that reload persistence and sign-out can be demonstrated. The CV list or editor UI is out of scope.
- **Cross-site request forgery**: CSRF protection uses an HTTP-only SameSite cookie as the primary control. Additional CSRF hardening is out of scope for this time-boxed feature and should be documented as a production follow-up.
- **Local vs. production**: The secure-cookie flag is on in production and off for plain-HTTP local development; all other cookie properties are identical.
- **Constraints inherited, not restated**: Technology, architecture, strict-typing, testing, and data-integrity constraints are defined by the project constitution and `.claude/rules/` and apply to this feature. They are intentionally not repeated or decided here.

### Out of Scope

OAuth and third-party sign-in, email verification, password reset, account recovery, roles and admin permissions, multi-factor authentication, AI generation, PDF export, clarification questions, full CV editing, job-description tailoring, failed-login throttling or lockout, additional CSRF hardening, account deletion, email or password change, and "sign out everywhere".
