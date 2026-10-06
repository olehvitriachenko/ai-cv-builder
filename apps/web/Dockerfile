FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@11.1.2
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter web...
ENV NEXT_PUBLIC_API_URL=/api
ENV API_INTERNAL_URL=http://api:3001/api
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

FROM build AS runtime
WORKDIR /app/apps/web
ENV NODE_ENV=production
RUN chown -R node:node .next
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
