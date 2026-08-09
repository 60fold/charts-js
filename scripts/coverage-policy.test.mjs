import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";
import {
  coverageIncludePatterns,
  coverageThresholds,
  exactCoverageThresholdTargets,
  validateCoverageSummary,
} from "./coverage-policy.mjs";

test("every exact coverage threshold still targets a source file", async () => {
  for (const target of exactCoverageThresholdTargets) {
    assert.ok(Object.hasOwn(coverageThresholds, target), `Coverage policy is missing ${target}`);
    const info = await stat(new URL(`../${target}`, import.meta.url));
    assert.ok(info.isFile(), `Coverage target is not a file: ${target}`);
  }
});

test("coverage cannot pass with an empty source selection", async () => {
  assert.ok(
    coverageIncludePatterns.length >= 4,
    "Coverage must retain explicit source include patterns",
  );
  assert.ok(
    exactCoverageThresholdTargets.every((target) =>
      coverageIncludePatterns.some((pattern) => {
        if (pattern === target) return true;
        const suffix = "/**/*.ts";
        return (
          pattern.endsWith(suffix) && target.startsWith(`${pattern.slice(0, -suffix.length)}/`)
        );
      }),
    ),
    "Coverage include patterns must still reach every exact threshold target",
  );
});

test("coverage report validation rejects Vitest's empty successful report", () => {
  assert.throws(
    () =>
      validateCoverageSummary({
        total: {
          lines: { total: 0, covered: 0, skipped: 0, pct: "Unknown" },
        },
      }),
    /no measured source files/,
  );
});

test("coverage report validation requires every exact threshold target", () => {
  assert.throws(
    () =>
      validateCoverageSummary({
        total: { lines: { total: 10, covered: 10 } },
        [exactCoverageThresholdTargets[0]]: { lines: { total: 10, covered: 10 } },
      }),
    /missing exact threshold target/,
  );
});
