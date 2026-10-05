# File Structure Rules

## Module organization

Keep feature modules organized by responsibility instead of placing many unrelated files in the module root.

Preferred NestJS module structure:

```text
feature/
├── feature.module.ts
├── controllers/
├── services/
├── guards/
├── decorators/
├── schemas/
├── types/
└── domain-specific-subfolder/