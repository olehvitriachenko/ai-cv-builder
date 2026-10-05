# AI CV Builder — Repository Instructions

Follow `.specify/memory/constitution.md` as the highest-level project guidance.

This is a time-boxed Fullstack Engineer test task.

## Core principles

- Prefer the smallest robust solution.
- Reliability and correctness are more important than feature breadth.
- Keep all generated code understandable and reviewable by a human developer.
- Avoid overengineering.
- Do not introduce abstractions, infrastructure, or dependencies without a concrete need.
- Keep changes scoped to the current task.
- Do not modify unrelated code.
- Do not replace the agreed stack unless the active specification requires it.

## Tech stack

Frontend:
- Next.js
- TypeScript
- App Router
- React Server Components by default
- Tailwind CSS
- React Hook Form
- Zod
- TanStack Query

Backend:
- NestJS
- Fastify
- REST API
- ESM

Database:
- PostgreSQL
- Prisma

Auth:
- Email + password
- Server-side sessions
- HTTP-only cookies

AI:
- Anthropic API
- Structured output
- Zod validation

Testing:
- Vitest

PDF:
- `@react-pdf/renderer`

Infrastructure:
- Docker Compose

## TypeScript

- MUST use strict TypeScript.
- MUST NOT use `any`.
- MUST NOT use implicit `any`.
- MUST NOT use `@ts-ignore`.
- MUST NOT weaken type safety for convenience.
- MUST use `unknown` for untrusted values and narrow it explicitly.
- SHOULD prefer explicit domain types.
- SHOULD prefer discriminated unions for lifecycle/state-machine logic.
- MUST validate runtime data at external boundaries.

## Rule routing

Read the relevant rule files before modifying code.

Frontend work:
`.claude/rules/frontend.md`

Backend, API, database, auth, authorization:
`.claude/rules/backend.md`

LLM, prompts, CV generation, AI behavior:
`.claude/rules/ai.md`

Tests, bug fixes, critical behavior:
`.claude/rules/testing.md`

Multiple rule files may apply to one task.

Examples:

- CV generation:
  `backend.md` + `ai.md` + `testing.md`

- CV editor:
  `frontend.md` + `testing.md`

- Authentication:
  `backend.md` + `testing.md`

- Generation polling:
  `frontend.md` + `testing.md`

## Workflow

Before implementation:

1. Read the active Spec Kit specification.
2. Read the relevant repository rules.
3. Inspect the existing implementation.
4. Reuse existing patterns where appropriate.
5. Identify the smallest safe implementation.
6. Add or update tests for critical behavior.
7. Implement the change.
8. Run relevant tests.
9. Run type checking.
10. Run linting.
11. Review the diff.
12. Verify spec compliance.

## Scope discipline

The following are out of scope unless the specification changes:

- OAuth
- email verification
- password reset
- payments
- admin panel
- multiple CV templates
- tailoring a CV to a specific job description

When time is limited, reduce feature breadth rather than reliability.

## Final rule

When multiple implementations are valid, prefer the one that is:
- simpler
- safer
- easier to test
- easier to explain
- easier to review
- easier to maintain