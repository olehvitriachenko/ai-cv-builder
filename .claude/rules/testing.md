# Testing Rules

Use Vitest.

Testing should focus on meaningful product and engineering risk.

## General

- SHOULD prefer test-first development for critical logic.
- MUST NOT optimize only for coverage percentage.
- MUST NOT write meaningless tests just to increase coverage.

Preferred workflow:

1. Define expected behavior.
2. Add/update a failing test where practical.
3. Implement the smallest change.
4. Run the relevant tests.
5. Refactor after behavior is correct.

MUST NOT weaken tests just to make implementation pass.

## Priorities

Prioritize tests for:
- registration
- login
- session creation
- session validation
- logout
- auth guards
- authorization
- CV ownership
- cross-user access prevention
- LLM output validation
- generation lifecycle
- generation failure
- clarification flow
- critical transformations
- PDF ownership enforcement

## Unit tests

Use unit tests for:
- pure functions
- Zod schemas
- domain validation
- state transitions
- transformations
- mapping logic

Pure domain logic SHOULD NOT require Nest app bootstrap.

## Integration tests

Use integration tests for:
- Nest modules
- controllers
- HTTP contracts
- session handling
- auth
- authorization
- Prisma/database behavior
- ownership rules

Prefer app injection/testing over opening real network ports when practical.

## Database tests

Important DB invariants SHOULD be exercised against realistic DB behavior where practical.

Tests MUST:
- isolate data
- not depend on execution order

## Auth tests

At minimum cover:
- successful registration
- duplicate email
- successful login
- invalid password
- authenticated session access
- unauthenticated rejection
- logout invalidation

## Ownership tests

Ownership is a critical security boundary.

Explicitly test:
- User A can access User A's CV.
- User A cannot access User B's CV.
- User A cannot update User B's CV.
- User A cannot delete User B's CV.
- User A cannot generate/export User B's CV.

## Generation lifecycle tests

Test:
- `PENDING -> PROCESSING`
- `PROCESSING -> COMPLETED`
- `PROCESSING -> FAILED`

Test duplicate protection if implemented.

Test failure/recovery behavior where implemented.

## LLM tests

Mock Anthropic.

MUST NOT call the real Anthropic API in ordinary automated tests.

Test:
- valid structured output
- malformed output
- schema validation failure
- provider failure
- clarification generation
- no persistence before validation

## Frontend tests

Do not test visual markup only for coverage.

Good candidates:
- form validation
- generation polling behavior
- polling stops on terminal state
- clarification submission
- important editor interactions

## Regression tests

Bug fixes SHOULD include a regression test where practical.

The test should fail before the fix and pass after it.

## Assertions

Prefer assertions on observable behavior:
- returned value
- HTTP response
- DB state
- lifecycle state
- rendered user-visible behavior

Avoid asserting private implementation details.

## Mocks

Mock external boundaries, not arbitrary internal code.

Good mock candidates:
- Anthropic
- third-party services
- time/clock where necessary

Avoid over-mocking pure domain code.

## Completion

Before marking a feature complete:
- run relevant tests
- verify existing tests still pass
- run type checking
- inspect failures instead of bypassing them