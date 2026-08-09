#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { validateCoverageSummary } from "./coverage-policy.mjs";

const reportFile = path.resolve(process.argv[2] ?? "coverage/coverage-summary.json");
const summary = JSON.parse(await readFile(reportFile, "utf8"));
validateCoverageSummary(summary);

const measuredFiles = Object.keys(summary).filter((name) => name !== "total").length;
console.log(
  `Verified non-empty coverage output (${measuredFiles} files, ${summary.total.lines.covered}/${summary.total.lines.total} lines).`,
);
