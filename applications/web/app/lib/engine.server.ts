import { createEngine } from "@url-shortener/engine";

/**
 * Server-only singleton wiring the engine's composition root (Prisma-backed
 * by default). Imported from route modules only — never from client code.
 */
export const engine = createEngine();
