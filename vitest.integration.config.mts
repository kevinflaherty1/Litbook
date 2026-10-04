import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The local Supabase keys live in .env.local (Next skips it when NODE_ENV=test).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // "server-only" throws outside React Server Components; it's a no-op here.
    alias: {
      "server-only": fileURLToPath(new URL("tests/integration/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
