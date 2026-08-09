#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateAggregateBenchmarkBudgets,
  evaluatePairedFrameTimeRegression,
  findBenchmarkReference,
  upsertBenchmarkReference,
} from "./benchmark-reference.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parsed = parseArguments(process.argv.slice(2));
const seriesCases = [1, 4, 16];
const resultsDirectory = path.join(root, "artifacts/benchmark-matrix");
const baselinePath = path.join(root, "benchmarks/line/baseline.json");
const referenceRoot = parsed.referenceRoot ? path.resolve(root, parsed.referenceRoot) : null;
if (referenceRoot && parsed.updateBaseline) {
  throw new Error("--reference-root and --update-baseline cannot be combined.");
}
await mkdir(resultsDirectory, { recursive: true });

const resultsBySeries = new Map();
const referenceResultsBySeries = new Map();
const builtSourceRoots = new Set();
for (const seriesCount of seriesCases) {
  const results = [];
  const referenceResults = [];
  for (let repetition = 0; repetition < parsed.repetitions; repetition++) {
    const variants =
      referenceRoot && repetition % 2 === 1
        ? [
            { label: "reference", sourceRoot: referenceRoot },
            { label: "current", sourceRoot: root },
          ]
        : [
            { label: "current", sourceRoot: root },
            ...(referenceRoot ? [{ label: "reference", sourceRoot: referenceRoot }] : []),
          ];
    for (const variant of variants) {
      const benchmarkResult = await runBenchmark({
        label: variant.label,
        repetition,
        seriesCount,
        sourceRoot: variant.sourceRoot,
      });
      if (variant.label === "reference") {
        referenceResults.push(benchmarkResult);
      } else {
        results.push(benchmarkResult);
      }
    }
  }
  resultsBySeries.set(seriesCount, results);
  if (referenceRoot) {
    referenceResultsBySeries.set(seriesCount, referenceResults);
  }
}

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const failures = [];
for (const seriesCount of seriesCases) {
  const results = resultsBySeries.get(seriesCount);
  const ordered = [...results].sort(
    (left, right) => left.results.frameTimeMs.p95 - right.results.frameTimeMs.p95,
  );
  const representative = ordered[Math.floor(ordered.length / 2)];
  const baselineCase = baseline.cases.find((entry) => entry.scenario.seriesCount === seriesCount);
  if (!baselineCase) {
    failures.push(`${seriesCount} series has no committed baseline case`);
    continue;
  }
  const aggregate = evaluateAggregateBenchmarkBudgets({
    results,
    budgets: baselineCase.budgets,
    enforceFrameTimeBudget: !referenceRoot,
    structuralMetrics: [
      {
        key: "maxPresentationVertices",
        budgetKey: "maxPresentationVertices",
        label: "presentation vertices",
        selectValue: (result) => result.results.presentationVertices.max,
      },
      {
        key: "maxPresentationQueryVisits",
        budgetKey: "maxPresentationQueryVisits",
        label: "presentation query visits",
        selectValue: (result) => result.results.presentationQueryVisits.max,
      },
    ],
  });
  const { maxPresentationQueryVisits, maxPresentationVertices } = aggregate.measurements;
  const frameTimeTargetNote =
    referenceRoot && aggregate.frameTimeBudgetExceeded
      ? `; fixed target ${baselineCase.budgets.p95FrameTimeMs} ms is informational in paired mode`
      : "";
  process.stdout.write(
    `${seriesCount} series: aggregate p95 ${aggregate.p95FrameTimeMs} ms${frameTimeTargetNote}; ` +
      `max presentation vertices ${maxPresentationVertices}; ` +
      `max query visits ${maxPresentationQueryVisits}\n`,
  );
  failures.push(...aggregate.failures.map((failure) => `${seriesCount} series ${failure}`));
  if (referenceRoot) {
    const referenceResults = referenceResultsBySeries.get(seriesCount);
    const maxRegressionMilliseconds = baseline.maxRegressionMilliseconds ?? 1;
    const comparison = evaluatePairedFrameTimeRegression({
      current: results,
      reference: referenceResults,
      maxRegressionPercent: baseline.maxRegressionPercent,
      maxRegressionMilliseconds,
    });
    process.stdout.write(
      `${seriesCount} series: paired median deltas ${comparison.median.deltas.join(", ")}%; ` +
        `paired median absolute deltas ${comparison.median.millisecondDeltas.join(", ")} ms; ` +
        `aggregate ${comparison.median.median}% / ${comparison.median.millisecondMedian} ms\n` +
        `${seriesCount} series: paired p95 deltas ${comparison.p95.deltas.join(", ")}%; ` +
        `paired p95 absolute deltas ${comparison.p95.millisecondDeltas.join(", ")} ms; ` +
        `aggregate ${comparison.p95.median}% / ${comparison.p95.millisecondMedian} ms\n` +
        `${seriesCount} series: jointly regressed pairs ${comparison.regressedPairCount}/${comparison.pairs.length}; ` +
        `strict majority requires ${comparison.requiredRegressedPairCount}\n`,
    );
    if (comparison.exceeded) {
      failures.push(
        `${seriesCount} series regressed in ${comparison.regressedPairCount}/${comparison.pairs.length} paired runs; ` +
          `limits are ${baseline.maxRegressionPercent}% / ${maxRegressionMilliseconds} ms against the checked-out reference`,
      );
    }
    continue;
  }
  if (parsed.updateBaseline) {
    upsertBenchmarkReference(baselineCase, representative);
  }
  const reference = findBenchmarkReference(baselineCase, representative.environment);
  const referenceP95 = reference?.results?.frameTimeMs?.p95;
  const maxRegressionMilliseconds = baseline.maxRegressionMilliseconds ?? 1;
  const comparison = reference
    ? evaluatePairedFrameTimeRegression({
        current: [representative],
        reference: [reference],
        maxRegressionPercent: baseline.maxRegressionPercent,
        maxRegressionMilliseconds,
      })
    : null;
  process.stdout.write(
    `${seriesCount} series: p95 repetitions ${ordered
      .map((result) => result.results.frameTimeMs.p95)
      .join(
        ", ",
      )} ms; median ${aggregate.p95FrameTimeMs} ms; reference ${referenceP95 ?? "missing"} ms; ` +
      `p95 delta ${comparison?.p95.median ?? "n/a"}% / ${comparison?.p95.millisecondMedian ?? "n/a"} ms; ` +
      `median delta ${comparison?.median.median ?? "n/a"}% / ${comparison?.median.millisecondMedian ?? "n/a"} ms\n`,
  );
  if (!parsed.updateBaseline) {
    if (!comparison) {
      failures.push(`${seriesCount} series has no committed comparison reference`);
    } else if (comparison.exceeded) {
      failures.push(
        `${seriesCount} series regressed in ${comparison.regressedPairCount}/${comparison.pairs.length} paired runs; ` +
          `limits are ${baseline.maxRegressionPercent}% / ${maxRegressionMilliseconds} ms`,
      );
    }
  }
}

if (parsed.updateBaseline) {
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}
if (failures.length > 0) {
  throw new Error(
    `Line benchmark matrix exceeded its comparison gate:\n- ${failures.join("\n- ")}`,
  );
}

function parseArguments(arguments_) {
  const forwarded = [];
  let repetitions = 3;
  let updateBaseline = false;
  let referenceRoot = null;
  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];
    if (argument === "--") continue;
    if (argument === "--compare") continue;
    if (argument === "--enforce") continue;
    if (argument === "--update-baseline") {
      updateBaseline = true;
      continue;
    }
    if (argument === "--reference-root") {
      referenceRoot = arguments_[++index];
      continue;
    }
    if (argument === "--repetitions") {
      const parsed = Number(arguments_[++index]);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed % 2 === 0) {
        throw new Error("--repetitions requires a positive odd integer.");
      }
      repetitions = parsed;
      continue;
    }
    forwarded.push(argument);
  }
  return { forwarded, referenceRoot, repetitions, updateBaseline };
}

async function runBenchmark({ label, repetition, seriesCount, sourceRoot }) {
  const output = path.join(
    resultsDirectory,
    `series-${seriesCount}-${label}-run-${repetition + 1}.json`,
  );
  const sourceWasBuilt = builtSourceRoots.has(sourceRoot);
  const arguments_ = [
    "scripts/benchmark-line.mjs",
    "--series",
    String(seriesCount),
    "--output",
    path.relative(root, output),
    ...(sourceRoot === root ? [] : ["--source-root", path.relative(root, sourceRoot)]),
    ...(sourceWasBuilt ? ["--skip-core-build", "--skip-package-build"] : []),
    ...parsed.forwarded,
  ];
  const result = spawnSync(process.execPath, arguments_, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Line benchmark matrix stopped at ${seriesCount} series, ${label} repetition ${repetition + 1} (exit ${result.status}).`,
    );
  }
  builtSourceRoots.add(sourceRoot);
  return JSON.parse(await readFile(output, "utf8"));
}
