import { PrismaClient } from "@prisma/client";

let client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

/**
 * Closes the shared Prisma connection pool, if one was ever opened. Safe to
 * call when no client exists (no-op) and idempotent. Intended for graceful
 * shutdown so the process releases its DB connections instead of leaving them
 * dangling until the socket times out. Exposed via the engine's dedicated
 * `@url-shortener/engine/lifecycle` subpath so the raw-Node web server can
 * wire it into its shutdown path without importing the whole engine barrel.
 */
export async function disconnectPrismaClient(): Promise<void> {
  if (client === undefined) {
    return;
  }
  await client.$disconnect();
  client = undefined;
}
