const ENVIRONMENT_KEYS = ["browser", "browserVersion", "platform", "architecture", "node"];

export function findBenchmarkReference(baselineCase, environment) {
  const references =
    baselineCase?.references ?? (baselineCase?.reference ? [baselineCase.reference] : []);
  return references.find((reference) =>
    sameBenchmarkEnvironment(reference.environment, environment),
  );
}

export function sameBenchmarkEnvironment(left, right) {
  if (!left || !right) return false;
  return ENVIRONMENT_KEYS.every((key) => left[key] === right[key]);
}

export function upsertBenchmarkReference(baselineCase, result) {
  const references =
    baselineCase.references ?? (baselineCase.reference ? [baselineCase.reference] : []);
  const reference = {
    environment: result.environment,
    results: result.results,
  };
  const index = references.findIndex((candidate) =>
    sameBenchmarkEnvironment(candidate.environment, result.environment),
  );
  if (index >= 0) references[index] = reference;
  else references.push(reference);
  baselineCase.references = references;
  delete baselineCase.reference;
  return reference;
}

export function medianPairedDelta(current, reference, selectValue) {
  if (current.length !== reference.length || current.length === 0) {
    throw new Error("Paired benchmark results must have equal non-zero lengths.");
  }
  const pairs = current.map((result, index) => pairedDelta(result, reference[index], selectValue));
  const deltas = pairs.map((pair) => pair.percent).sort((left, right) => left - right);
  const millisecondDeltas = pairs
    .map((pair) => pair.milliseconds)
    .sort((left, right) => left - right);
  return {
    deltas,
    median: deltas[Math.floor(deltas.length / 2)],
    millisecondDeltas,
    millisecondMedian: millisecondDeltas[Math.floor(millisecondDeltas.length / 2)],
  };
}

export function medianSelectedValue(results, selectValue) {
  if (results.length === 0) {
    throw new Error("Benchmark aggregation requires at least one result.");
  }
  const values = results.map((result) => selectValue(result)).sort((left, right) => left - right);
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Benchmark aggregation values must be finite.");
  }
  return values[Math.floor(values.length / 2)];
}

export function evaluateAggregateBenchmarkBudgets({
  results,
  budgets,
  enforceFrameTimeBudget = true,
  structuralMetrics = [],
}) {
  const p95FrameTimeMs = medianSelectedValue(results, (result) => result.results.frameTimeMs.p95);
  const frameTimeBudgetExceeded = p95FrameTimeMs > budgets.p95FrameTimeMs;
  const failures = [];
  if (enforceFrameTimeBudget && frameTimeBudgetExceeded) {
    failures.push(`aggregate p95 frame time ${p95FrameTimeMs} ms > ${budgets.p95FrameTimeMs} ms`);
  }

  const measurements = {};
  for (const metric of structuralMetrics) {
    const value = Math.max(...results.map((result) => metric.selectValue(result)));
    measurements[metric.key] = value;
    if (value > budgets[metric.budgetKey]) {
      failures.push(`${metric.label} ${value} > ${budgets[metric.budgetKey]}`);
    }
  }

  return {
    failures,
    frameTimeBudgetExceeded,
    measurements,
    p95FrameTimeMs,
  };
}

export function evaluatePairedFrameTimeRegression({
  current,
  reference,
  maxRegressionPercent,
  maxRegressionMilliseconds,
}) {
  const median = medianPairedDelta(
    current,
    reference,
    (result) => result.results.frameTimeMs.median,
  );
  const p95 = medianPairedDelta(current, reference, (result) => result.results.frameTimeMs.p95);
  const pairs = current.map((result, index) => {
    const referenceResult = reference[index];
    const pairMedian = pairedDelta(
      result,
      referenceResult,
      (entry) => entry.results.frameTimeMs.median,
    );
    const pairP95 = pairedDelta(result, referenceResult, (entry) => entry.results.frameTimeMs.p95);
    return {
      median: pairMedian,
      p95: pairP95,
      exceeded:
        exceedsRegressionTolerance({
          percentDelta: pairMedian.percent,
          millisecondDelta: pairMedian.milliseconds,
          maxRegressionPercent,
          maxRegressionMilliseconds,
        }) &&
        exceedsRegressionTolerance({
          percentDelta: pairP95.percent,
          millisecondDelta: pairP95.milliseconds,
          maxRegressionPercent,
          maxRegressionMilliseconds,
        }),
    };
  });
  const regressedPairCount = pairs.filter((pair) => pair.exceeded).length;
  const requiredRegressedPairCount = Math.floor(pairs.length / 2) + 1;
  return {
    median,
    pairs,
    p95,
    regressedPairCount,
    requiredRegressedPairCount,
    exceeded: regressedPairCount >= requiredRegressedPairCount,
  };
}

function pairedDelta(result, reference, selectValue) {
  const referenceValue = selectValue(reference);
  if (!(referenceValue > 0)) {
    throw new Error("Paired benchmark references must be positive.");
  }
  const millisecondDelta = selectValue(result) - referenceValue;
  return {
    percent: Number(((millisecondDelta / referenceValue) * 100).toFixed(1)),
    milliseconds: Number(millisecondDelta.toFixed(3)),
  };
}

export function exceedsRegressionTolerance({
  percentDelta,
  millisecondDelta,
  maxRegressionPercent,
  maxRegressionMilliseconds,
}) {
  return percentDelta > maxRegressionPercent && millisecondDelta > maxRegressionMilliseconds;
}
