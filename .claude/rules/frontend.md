# Frontend Rules

These rules apply to Next.js, React, Tailwind, forms, client state and UI behavior.

## Architecture

- MUST use Next.js App Router.
- MUST use React Server Components by default.
- MUST use `"use client"` only when client-side behavior is required.
- MUST NOT make an entire page a Client Component because one child needs interactivity.
- SHOULD prefer server-side data fetching over `useEffect` fetching.
- MUST NOT use `useEffect` for server data when a Server Component can load it cleanly.

Preferred pattern:

`Server Component -> load data -> render -> small Client Component`

## Components

- SHOULD keep components small and focused.
- MUST NOT mix data loading, business logic, form logic, API calls and rendering in one giant component.
- SHOULD split by real responsibility.
- MUST NOT over-split trivial markup into meaningless micro-components.
- SHOULD prefer composition over components with many unrelated boolean props.

## Forms

- MUST use React Hook Form for non-trivial forms.
- MUST use Zod for form validation.
- SHOULD use `useFieldArray` for dynamic sections such as:
  - experience
  - education
  - skills when structured
  - clarification answers when dynamic
- MUST NOT move normal form state into global state.
- MUST NOT submit invalid form data.

## Client state

For local UI state, use:
- `useState`
- `useReducer`

Use TanStack Query for client-side server synchronization where it adds clear value.

Good uses:
- CV generation polling
- save/update mutations
- clarification-answer mutations
- cache invalidation
- background refetching
- retry/error handling

- MUST NOT use TanStack Query for everything.
- MUST NOT use it as a replacement for Server Components.
- MUST NOT introduce Zustand unless a concrete global client-state requirement appears.

## Generation polling

- MUST poll only while status is `PENDING` or `PROCESSING`.
- MUST stop polling on `COMPLETED` or `FAILED`.
- MUST refetch/invalidate CV data after successful generation.
- MUST NOT use overly aggressive polling intervals.
- MUST show clear loading and failure states.

## Tailwind

- MUST use Tailwind CSS as the primary styling solution.
- SHOULD prefer Tailwind utilities over inline styles, CSS modules and CSS-in-JS.
- MUST NOT introduce styled-components, Emotion, Chakra or MUI styling unless explicitly required.
- SHOULD avoid excessive arbitrary values.
- SHOULD use consistent spacing, colors, radius and typography tokens.
- SHOULD use mobile-first responsive classes.
- SHOULD avoid unnecessary breakpoint complexity.

## UI rules

- SHOULD follow the approved Figma design.
- SHOULD prioritize usability and implementation simplicity over pixel-perfect complexity.
- SHOULD reuse repeated primitives such as:
  - Button
  - Input
  - Textarea
  - Badge
  - Card
  - Dialog
  - Skeleton
  - EmptyState
- MUST NOT build a large abstract design system before repeated patterns exist.

## CV editor

The editor MUST be document-first, not form-first.

- The CV preview MUST be the dominant visual element.
- The user SHOULD understand how the final PDF will look while editing.
- SHOULD use realistic document layout and A4-like proportions.
- SHOULD prefer inline/focused editing over a giant admin form.
- Clarification questions SHOULD be visually secondary.

Desktop:
- main area = CV preview/editor
- side panel = AI clarification questions

Mobile:
- single-column layout

## Accessibility

- MUST use semantic HTML where possible.
- MUST use real buttons for actions.
- MUST provide accessible labels for form controls.
- MUST NOT rely on placeholder text as the only label.
- MUST provide visible focus states.
- MUST NOT rely on color alone for status/errors.
- SHOULD maintain sufficient contrast.

## Async UX

- MUST show loading, success and failure states where appropriate.
- MUST NOT leave the user on an apparently frozen screen.
- MUST show generation failures clearly and allow recovery.

## API client / fetcher

Use a shared typed API fetcher for calls to the NestJS backend.

The fetcher MUST:
- be generic over the response type
- support typed request bodies
- handle JSON parsing centrally
- handle non-2xx responses centrally
- support standard HTTP methods
- avoid returning `any`
- return typed data or throw a typed application error
- handle `204 No Content` responses without attempting JSON parsing
- support non-JSON responses when required, such as PDF downloads

Prefer a small wrapper around the native `fetch` API.

MUST NOT introduce Axios unless a concrete requirement appears.

Preferred API shape:

`apiFetch<TResponse, TBody = undefined>(...)`

The fetcher SHOULD support:
- GET
- POST
- PATCH
- PUT
- DELETE

When used from browser Client Components, authenticated requests MUST include:

`credentials: 'include'`

so HTTP-only session cookies are sent automatically.

When used from Server Components or other server-side code, session cookies SHOULD be forwarded explicitly through the server-side request context rather than relying on browser behavior.

The fetcher SHOULD centralize:
- API base URL
- common headers
- JSON serialization
- response parsing
- error normalization
- request configuration shared across endpoints

The fetcher SHOULD allow optional runtime response validation with Zod for critical API boundaries.

The fetcher MUST NOT:
- duplicate fetch boilerplate across components
- contain endpoint-specific business logic
- contain domain-specific transformations
- hide authorization decisions
- assume every successful response is JSON
- use unsafe type assertions to force unknown responses into application types

The fetcher is transport infrastructure only.

Endpoint-specific behavior belongs in dedicated API/domain functions built on top of the generic fetcher.