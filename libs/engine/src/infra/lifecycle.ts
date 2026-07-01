// Public shutdown surface for the engine, exposed via the
// `@url-shortener/engine/lifecycle` package subpath and imported directly by
// the raw-Node web server (`server.ts`). It re-exports ONLY
// `disconnectPrismaClient` — the raw `getPrismaClient` accessor stays inside
// `prisma-client.ts` and is NEVER reachable through this subpath, so no
// consumer can grab a Prisma handle that bypasses the domain invariants
// (SSRF block, LongUrl/ShortCode validation, cache).
//
// The `.ts` import extension is required for Node's native TypeScript runtime
// to resolve this at boot; the engine's tsconfig enables
// `allowImportingTsExtensions` (with `emitDeclarationOnly`) for exactly this.
export { disconnectPrismaClient } from "./prisma-client.ts";
