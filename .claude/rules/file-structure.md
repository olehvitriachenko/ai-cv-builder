# File Structure Rules

## Purpose

Keep the codebase easy to scan, navigate, and extend.

Prefer organizing files by responsibility and feature-local domain concerns instead of allowing module roots to become large flat directories.

The goal is consistency and readability, not maximum abstraction.

---

## General principles

- Keep related files close together.
- Group files by clear responsibility.
- Prefer shallow, predictable directory structures.
- Avoid large flat folders containing unrelated file types.
- Avoid unnecessary deep nesting.
- Avoid creating folders purely for architectural appearance.
- Prefer direct imports over excessive barrel files.
- Keep tests colocated with the code they test where practical.

When adding a file, first inspect the surrounding module and follow its existing structure.

---

## NestJS feature module structure

Preferred structure:

```text
feature/
├── feature.module.ts
├── feature.controllers.ts
├── services/
├── guards/
├── decorators/
├── schemas/
├── types/
└── domain-specific/
```

---

## Next.js frontend structure

Use a lightweight feature-first structure.

Preferred:

```text
src/
├── app/
├── features/
├── shared/
└── entities/ # optional
```
