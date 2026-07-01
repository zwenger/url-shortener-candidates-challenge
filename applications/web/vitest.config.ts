import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Standalone config — intentionally does NOT import/extend/merge vite.config.ts.
// The reactRouter() Vite plugin (route manifest, SSR entry) breaks Vitest test
// collection, so this config only wires tsconfigPaths() for workspace:* alias
// resolution (see design.md, "Vitest config topology" decision).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["**/*.test.ts", "**/*.test.tsx", "**/*.e2e.test.ts"],
    allowOnly: false,
  },
});
