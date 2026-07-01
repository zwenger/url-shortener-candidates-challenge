#!/bin/sh
set -e

pnpm --filter @url-shortener/engine exec prisma migrate deploy --schema=/app/libs/engine/prisma/schema.prisma

exec "$@"
