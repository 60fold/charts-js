import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAggregateBenchmarkBudgets,
  evaluatePairedFrameTimeRegression,
  exceedsRegressionTolerance,
  findBenchmarkReference,
  medianPairedDelta,
  medianSelectedValue,
  sameBenchmarkEnvironment,
  upsertBenchmarkReference,
} from "./benchmark-reference.mjs";

const macEnvironment = {
  browser: "chromium",
  browserVersion: "149.0.7827.55",
  platform: "darwin",
  architecture: "arm64",
  node: "v22.22.3",
  capturedAt: "earlier",
};
const linuxEnvironment = {
  ...macEnvironment,
  platform: "linux",
  architecture: "x64",
};

test("benchmark environments ignore capture time but not runtime identity", () => {
  assert.equal(
    sameBenchmarkEnvironment(macEnvironment, {
      ...macEnvironment,
      capturedAt: "later",
    }),
    true,
  );
  assert.equal(sameBenchmarkEnvironment(macEnvironment, linuxEnvironment), false);
});

test("legacy references migrate without discarding another environment", () => {
  const baselineCase = {
    reference: {
      environment: macEnvironment,
      results: { frameTimeMs: { p95: 7 } },
    },
  };
  upsertBenchmarkReference(baselineCase, {
    environment: linuxEnvironment,
    results: { frameTimeMs: { p95: 8 } },
  });

  assert.equal("reference" in baselineCase, false);
  assert.equal(baselineCase.references.length, 2);
  assert.equal(findBenchmarkReference(baselineCase, macEnvironment).results.frameTimeMs.p95, 7);
  assert.equal(findBenchmarkReference(baselineCase, linuxEnvironment).results.frameTimeMs.p95, 8);
});

test("upserting replaces only the matching environment", () => {
  const baselineCase = { references: [] };
  upsertBenchmarkReference(baselineCase, {
    environment: macEnvironment,
    results: { frameTimeMs: { p95: 7 } },
  });
  upsertBenchmarkReference(baselineCase, {
    environment: { ...macEnvironment, capturedAt: "later" },
    results: { frameTimeMs: { p95: 6 } },
  });

  assert.equal(baselineCase.references.length, 1);
  assert.equal(findBenchmarkReference(baselineCase, macEnvironment).results.frameTimeMs.p95, 6);
});

test("paired comparison uses the median per-run regression", () => {
  const comparison = medianPairedDelta(
    [{ p95: 12 }, { p95: 9 }, { p95: 11 }],
    [{ p95: 10 }, { p95: 10 }, { p95: 10 }],
    (result) => result.p95,
  );
  assert.deepEqual(comparison, {
    deltas: [-10, 10, 20],
    median: 10,
    millisecondDeltas: [-1, 1, 2],
    millisecondMedian: 1,
  });
});

test("regression tolerance ignores percentage noise below the absolute floor", () => {
  assert.equal(
    exceedsRegressionTolerance({
      percentDelta: 4.7,
      millisecondDelta: 0.3,
      maxRegressionPercent: 3,
      maxRegressionMilliseconds: 1,
    }),
    false,
  );
  assert.equal(
    exceedsRegressionTolerance({
      percentDelta: 2.9,
      millisecondDelta: 1.2,
      maxRegressionPercent: 3,
      maxRegressionMilliseconds: 1,
    }),
    false,
  );
  assert.equal(
    exceedsRegressionTolerance({
      percentDelta: 4.7,
      millisecondDelta: 1.1,
      maxRegressionPercent: 3,
      maxRegressionMilliseconds: 1,
    }),
    true,
  );
});

test("paired comparison rejects incomplete pairs", () => {
  assert.throws(
    () => medianPairedDelta([{ p95: 1 }], [], (result) => result.p95),
    /equal non-zero lengths/,
  );
});

test("benchmark aggregation selects the median value", () => {
  assert.equal(
    medianSelectedValue([{ p95: 58.9 }, { p95: 56.7 }, { p95: 59.9 }], (result) => result.p95),
    58.9,
  );
  assert.throws(() => medianSelectedValue([], (result) => result.p95), /at least one result/);
});

test("paired-run frame targets are informational while structural budgets remain enforced", () => {
  const results = [
    benchmarkResult(59.8, 69.4, 996),
    benchmarkResult(60.2, 70.5, 996),
    benchmarkResult(60.6, 71.7, 996),
  ];
  const budgets = {
    p95FrameTimeMs: 60,
    maxRenderedCandles: 2000,
  };
  const structuralMetrics = [
    {
      key: "maxRenderedCandles",
      budgetKey: "maxRenderedCandles",
      label: "rendered candles",
      selectValue: (result) => result.results.renderedCandles.max,
    },
  ];

  const paired = evaluateAggregateBenchmarkBudgets({
    results,
    budgets,
    enforceFrameTimeBudget: false,
    structuralMetrics,
  });
  assert.equal(paired.p95FrameTimeMs, 70.5);
  assert.equal(paired.frameTimeBudgetExceeded, true);
  assert.deepEqual(paired.failures, []);

  const standalone = evaluateAggregateBenchmarkBudgets({
    results,
    budgets,
    structuralMetrics,
  });
  assert.deepEqual(standalone.failures, ["aggregate p95 frame time 70.5 ms > 60 ms"]);

  const structurallyInvalid = evaluateAggregateBenchmarkBudgets({
    results: [benchmarkResult(60, 70, 2001)],
    budgets,
    enforceFrameTimeBudget: false,
    structuralMetrics,
  });
  assert.deepEqual(structurallyInvalid.failures, ["rendered candles 2001 > 2000"]);
});

test("tail jitter alone is not treated as a renderer regression", () => {
  const result = evaluatePairedFrameTimeRegression({
    current: [frameTimes(48.7, 58.9), frameTimes(48.2, 59.9), frameTimes(48.4, 56.7)],
    reference: [frameTimes(48.5, 57), frameTimes(48.1, 55.9), frameTimes(48.4, 58.8)],
    maxRegressionPercent: 3,
    maxRegressionMilliseconds: 1,
  });

  assert.equal(result.p95.median, 3.3);
  assert.equal(result.p95.millisecondMedian, 1.9);
  assert.equal(result.median.median, 0.2);
  assert.equal(result.median.millisecondMedian, 0.1);
  assert.equal(result.regressedPairCount, 0);
  assert.equal(result.exceeded, false);
});

test("noise in different paired runs is not combined into a false regression", () => {
  const result = evaluatePairedFrameTimeRegression({
    current: [frameTimes(32.4, 42.3), frameTimes(49.5, 57.5), frameTimes(34.1, 41.4)],
    reference: [frameTimes(32.3, 39.4), frameTimes(33.8, 50.5), frameTimes(32.4, 42.4)],
    maxRegressionPercent: 3,
    maxRegressionMilliseconds: 1,
  });

  assert.equal(result.median.median, 5.2);
  assert.equal(result.median.millisecondMedian, 1.7);
  assert.equal(result.p95.median, 7.4);
  assert.equal(result.p95.millisecondMedian, 2.9);
  assert.deepEqual(
    result.pairs.map((pair) => pair.exceeded),
    [false, true, false],
  );
  assert.equal(result.regressedPairCount, 1);
  assert.equal(result.requiredRegressedPairCount, 2);
  assert.equal(result.exceeded, false);
});

test("consistent median and tail regressions exceed the gate", () => {
  const result = evaluatePairedFrameTimeRegression({
    current: [frameTimes(52, 62), frameTimes(52.5, 62.5), frameTimes(53, 63)],
    reference: [frameTimes(50, 60), frameTimes(50, 60), frameTimes(50, 60)],
    maxRegressionPercent: 3,
    maxRegressionMilliseconds: 1,
  });

  assert.equal(result.regressedPairCount, 3);
  assert.equal(result.requiredRegressedPairCount, 2);
  assert.equal(result.exceeded, true);
});

test("a strict majority of jointly regressed pairs exceeds the gate", () => {
  const result = evaluatePairedFrameTimeRegression({
    current: [frameTimes(52, 62), frameTimes(52.5, 62.5), frameTimes(50.5, 68)],
    reference: [frameTimes(50, 60), frameTimes(50, 60), frameTimes(50, 60)],
    maxRegressionPercent: 3,
    maxRegressionMilliseconds: 1,
  });

  assert.deepEqual(
    result.pairs.map((pair) => pair.exceeded),
    [true, true, false],
  );
  assert.equal(result.regressedPairCount, 2);
  assert.equal(result.requiredRegressedPairCount, 2);
  assert.equal(result.exceeded, true);
});

function frameTimes(median, p95) {
  return { results: { frameTimeMs: { median, p95 } } };
}

function benchmarkResult(median, p95, renderedCandles) {
  return {
    results: {
      frameTimeMs: { median, p95 },
      renderedCandles: { max: renderedCandles },
    },
  };
}
