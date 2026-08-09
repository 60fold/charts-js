#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const steps = [
  ["Check source formatting", pnpm, ["run", "format:check"]],
  ["Run semantic lint", pnpm, ["run", "lint"]],
  ["Generate MCP developer guidance", pnpm, ["run", "mcp:guidance"]],
  ["Build packages for the API catalog", pnpm, ["-r", "--filter", "./packages/**", "run", "build"]],
  ["Generate the MCP API catalog", pnpm, ["run", "mcp:catalog"]],
  ["Typecheck the workspace", pnpm, ["run", "typecheck"]],
  ["Run unit and release-tool tests", pnpm, ["run", "test:unit"]],
  ["Build and verify public packages", pnpm, ["run", "build:packages"]],
  ["Build framework examples", pnpm, ["run", "build:examples"]],
  ["Smoke-test framework examples", process.execPath, ["scripts/check-framework-examples.mjs"]],
  [
    "Verify packed browser, worker, SSR, and tree-shaken consumers",
    process.execPath,
    ["scripts/check-packed-release.mjs"],
  ],
];

let exitCode = 0;
for (const [label, command, args] of steps) {
  process.stdout.write(`\n==> ${label}\n`);
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, CI: process.env.CI ?? "1" },
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    exitCode = result.status ?? 1;
    break;
  }
}

if (exitCode === 0) {
  process.stdout.write("\nComponents pre-deploy checks passed.\n");
}
process.exitCode = exitCode;
