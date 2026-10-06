FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.1.2
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter api...
RUN pnpm --filter api build

FROM build AS runtime
WORKDIR /app/apps/api
EXPOSE 3001
USER node
# Deploy existing migrations; a failure stops startup rather than masking schema drift.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy --config prisma7.config.ts && exec node dist/main.js"]
