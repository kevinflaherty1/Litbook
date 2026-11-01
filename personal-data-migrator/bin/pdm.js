#!/usr/bin/env node
// Thin launcher so `pdm` works without a build step: re-exec the TypeScript
// entry point with Node's built-in type stripping.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", entry, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
