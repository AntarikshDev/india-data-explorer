// @lovable.dev/vite-tanstack-config already includes the standard plugin stack.
// We override importProtection.client.files so that our existing `src/server/**`
// server functions (which use `createServerFn` and are safe to import from routes)
// aren't blocked by the default deny pattern.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    importProtection: {
      behavior: "error",
      client: {
        files: [],
        specifiers: ["server-only"],
      },
    },
  },
});
