import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  envDir: "../..",
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  ssr: {
    noExternal: ["@url-shortener/engine"],
    // @prisma/client's generated code resolves an internal ".prisma/client/*"
    // subpath at runtime that Vite's bundler cannot statically follow; it
    // must stay external and be resolved by Node from node_modules instead.
    external: ["@prisma/client"],
  },
  optimizeDeps: {
    include: ["@url-shortener/engine"],
  },
});
