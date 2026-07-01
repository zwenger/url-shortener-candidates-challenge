import { describe, expect, it } from "vitest";
import * as lifecycleSubpath from "@url-shortener/engine/lifecycle";
import * as lifecycle from "./lifecycle";

// The `@url-shortener/engine/lifecycle` subpath is the ONLY public surface the
// raw-Node web server imports. It must expose the shutdown helper WITHOUT
// leaking the raw PrismaClient accessor — otherwise a consumer could
// `import { getPrismaClient }` and bypass every domain invariant (SSRF block,
// LongUrl/ShortCode validation, cache). These guard that boundary.
describe("engine lifecycle public surface", () => {
  it("exports disconnectPrismaClient", () => {
    expect(typeof lifecycle.disconnectPrismaClient).toBe("function");
  });

  it("does NOT expose the raw getPrismaClient accessor", () => {
    expect(Object.keys(lifecycle)).not.toContain("getPrismaClient");
    expect(
      (lifecycle as Record<string, unknown>).getPrismaClient,
    ).toBeUndefined();
  });
});

// This is the load-bearing guard: it resolves the actual published subpath
// (via package.json `exports`), not the source file directly. If the subpath
// ever points at a module that also exports getPrismaClient, this fails.
describe("@url-shortener/engine/lifecycle published subpath", () => {
  it("exposes disconnectPrismaClient", () => {
    expect(typeof lifecycleSubpath.disconnectPrismaClient).toBe("function");
  });

  it("does NOT leak getPrismaClient through the subpath", () => {
    expect(Object.keys(lifecycleSubpath)).not.toContain("getPrismaClient");
    expect(
      (lifecycleSubpath as Record<string, unknown>).getPrismaClient,
    ).toBeUndefined();
  });
});
