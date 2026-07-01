import { afterEach, describe, expect, it, vi } from "vitest";

describe("config.server publicUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("resolves publicUrl from PUBLIC_URL", async () => {
    vi.stubEnv("PUBLIC_URL", "https://sho.rt");
    vi.resetModules();

    const { publicUrl } = await import("./config.server");

    expect(publicUrl).toBe("https://sho.rt");
  });

  it("is undefined when PUBLIC_URL is unset", async () => {
    vi.stubEnv("PUBLIC_URL", "");
    // stubEnv with "" sets an empty string; delete to truly unset it.
    delete process.env.PUBLIC_URL;
    vi.resetModules();

    const { publicUrl } = await import("./config.server");

    expect(publicUrl).toBeUndefined();
  });
});
