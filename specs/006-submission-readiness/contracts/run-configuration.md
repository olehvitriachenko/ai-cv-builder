# Contract: Run Configuration

What a reviewer provides to start the stack. The example file at the repository root (`.env.example`) lists the first group; Compose reads it.

| Variable | Required | Default | Meaning |
|----------|----------|---------|---------|
| `ANTHROPIC_API_KEY` | only for real generation | empty | The AI key. Empty or absent: everything works except real generation, which ends in the failed state `PROVIDER_NOT_CONFIGURED` with a retry. Never committed. |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-5-5` | The model used for generation and AI-assisted apply. |
| `WEB_PORT` | no | `3000` | Host port of the web app. |
| `API_PORT` | no | `3001` | Host port of the API (the browser does not need it; it is exposed for inspection). |
| `POSTGRES_PORT` | no | `5432` | Host port of the database. |

Fixed inside the container run (not meant to be changed): the database address and local credentials, the API's origin setting for the web app, `NODE_ENV=development` (HTTP cookies; an internet deployment would need HTTPS and `production`), the internal API address used by the web server.

Host development uses `apps/api/.env` (see `apps/api/.env.example`), which adds timeouts and the generation runner settings; they are not part of the one-command run.

## Behaviour contract

- Start: `docker compose up --build` (first time), `docker compose up` afterwards. Order: database healthy → API healthy → web.
- Addresses: web `http://localhost:${WEB_PORT}`; API `http://localhost:${API_PORT}/api`.
- Stop keeping data: `docker compose down`. Delete data: `docker compose down -v` (destructive).
- A failed migration stops the API's start with the error visible in the logs; data is never reset automatically.
