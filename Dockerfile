FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
WORKDIR /app

FROM base AS dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY libs/engine/package.json ./libs/engine/
COPY applications/web/package.json ./applications/web/
# Prisma schema must be present before install: libs/engine's postinstall runs `prisma generate`.
COPY libs/engine/prisma ./libs/engine/prisma
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/libs/engine/node_modules ./libs/engine/node_modules
COPY --from=dependencies /app/applications/web/node_modules ./applications/web/node_modules
COPY . .
RUN pnpm --filter @url-shortener/engine exec prisma generate
RUN pnpm build

FROM base AS production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/applications/web/node_modules ./applications/web/node_modules
COPY --from=build /app/libs/engine/node_modules ./libs/engine/node_modules
COPY --from=build /app/applications/web/build ./applications/web/build
COPY libs/engine/src ./libs/engine/src
COPY libs/engine/prisma ./libs/engine/prisma
COPY applications/web/package.json ./applications/web/
# server.ts is run directly by Node's native TypeScript support (no bundling
# step); app/lib is imported by server.ts for the load-context type
# augmentation and rate limiter.
COPY applications/web/server.ts ./applications/web/
COPY applications/web/app/lib ./applications/web/app/lib
COPY applications/web/tsconfig.json ./applications/web/
COPY libs/engine/package.json ./libs/engine/
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

WORKDIR /app/applications/web
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["pnpm", "start"]
