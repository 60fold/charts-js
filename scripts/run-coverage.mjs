#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const vitestCli = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const forwardedArguments = process.argv.slice(2);
if (forwardedArguments[0] === "--") forwardedArguments.shift();
const coverage = spawnSync(
  process.execPath,
  [vitestCli, "run", "--project", "engines", "--coverage", ...forwardedArguments],
  { stdio: "inherit" },
);
if (coverage.error) throw coverage.error;
if (coverage.status !== 0) process.exit(coverage.status ?? 1);

const verification = spawnSync(process.execPath, ["scripts/verify-coverage-output.mjs"], {
  stdio: "inherit",
});
if (verification.error) throw verification.error;
if (verification.status !== 0) process.exit(verification.status ?? 1);
