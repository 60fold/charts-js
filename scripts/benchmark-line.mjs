#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";
import {
  exceedsRegressionTolerance,
  findBenchmarkReference,
  upsertBenchmarkReference,
} from "./benchmark-reference.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArguments(process.argv.slice(2));
const sourceRoot = path.resolve(root, options.sourceRoot ?? ".");
const baselinePath = path.resolve(root, options.baseline ?? "benchmarks/line/baseline.json");

if (!options.skipCoreBuild) {
  run("pnpm", ["--filter", "@sixtyfold/core", "run", "build"]);
}
if (!options.skipPackageBuild) {
  run("pnpm", ["--filter", "@sixtyfold/line", "run", "build:benchmark"]);
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const relativePath =
      requestUrl.pathname === "/" || requestUrl.pathname === "/benchmarks/line/"
        ? "benchmarks/line/index.html"
        : requestUrl.pathname.slice(1);
    const servingRoot = relativePath.startsWith("packages/") ? sourceRoot : root;
    let resolved = path.resolve(servingRoot, relativePath);
    if (!resolved.startsWith(`${servingRoot}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    let body;
    try {
      body = await readFile(resolved);
    } catch (error) {
      const legacyRelativePath =
        sourceRoot !== root && relativePath.startsWith("packages/line/dist-benchmark/")
          ? relativePath.replace("packages/line/dist-benchmark/", "packages/line/dist/")
          : null;
      if (!legacyRelativePath) throw error;
      resolved = path.resolve(sourceRoot, legacyRelativePath);
      body = await readFile(resolved);
    }
    response.writeHead(200, {
      "content-type": contentType(resolved),
      "cache-control": "no-store",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(404).end(String(error));
  }
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

let browser;
try {
  const browserType = { chromium, firefox, webkit }[options.browser];
  if (!browserType) {
    throw new Error(`Unsupported browser ${JSON.stringify(options.browser)}.`);
  }
  // Do not add Chromium --enable-gpu here without redesigning the phase
  // profiler. Its benchmark-only getImageData readback makes deferred Canvas2D
  // work visible, but can permanently de-accelerate an accelerated context and
  // invalidate every following sample. CI intentionally uses this unaccelerated
  // launch shape.
  browser = await browserType.launch({ headless: !options.headed });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 720 },
    deviceScaleFactor: options.dpr,
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      process.stderr.write(`[browser] ${message.text()}\n`);
    }
  });
  page.on("pageerror", (error) => {
    process.stderr.write(`[browser] ${error.stack ?? error.message}\n`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      process.stderr.write(`[browser] ${response.status()} ${response.url()}\n`);
    }
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Benchmark server did not expose a TCP port.");
  }
  const url = new URL(`http://127.0.0.1:${address.port}/benchmarks/line/`);
  url.searchParams.set("points", String(options.points));
  url.searchParams.set("series", String(options.series));
  url.searchParams.set("samples", String(options.samples));
  url.searchParams.set("warmup", String(options.warmup));
  await page.goto(url.href, { waitUntil: "load", timeout: 30_000 });
  let lastStage = "";
  const stageLogger = setInterval(async () => {
    const stage = await page
      .evaluate(() => globalThis.__SIXTYFOLD_BENCHMARK_STAGE__ ?? "not-started")
      .catch(() => "page-unavailable");
    if (stage !== lastStage) {
      process.stderr.write(`[benchmark] ${stage}\n`);
      lastStage = stage;
    }
  }, 5_000);
  try {
    await page.waitForFunction(
      () => globalThis.__SIXTYFOLD_BENCHMARK_RESULT__ !== undefined,
      undefined,
      { timeout: 120_000 },
    );
  } catch (error) {
    const stage = await page.evaluate(
      () => globalThis.__SIXTYFOLD_BENCHMARK_STAGE__ ?? "not-started",
    );
    throw new Error(`Line benchmark stalled at ${stage}.`, { cause: error });
  } finally {
    clearInterval(stageLogger);
  }
  const pageResult = await page.evaluate(() => globalThis.__SIXTYFOLD_BENCHMARK_RESULT__);
  const result = {
    ...pageResult,
    environment: {
      browser: options.browser,
      browserVersion: browser.version(),
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      capturedAt: new Date().toISOString(),
    },
  };

  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  result.comparison = compareWithBaseline(result, baseline, {
    enforceReference: options.compare,
  });

  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  process.stdout.write(serialized);
  if (options.output) {
    const outputPath = path.resolve(root, options.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
  }
  if (options.updateBaseline) {
    updateBaselineReference(baseline, result);
    await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  }
  if (options.enforce && result.comparison.failures.length > 0) {
    throw new Error(
      `Line benchmark exceeded its budget:\n- ${result.comparison.failures.join("\n- ")}`,
    );
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

function parseArguments(arguments_) {
  const parsed = {
    browser: "chromium",
    dpr: 1,
    points: 600_000,
    samples: 40,
    warmup: 10,
    series: 4,
    headed: false,
    enforce: false,
    compare: false,
    updateBaseline: false,
    skipCoreBuild: false,
    skipPackageBuild: false,
    output: null,
    baseline: null,
    sourceRoot: null,
  };
  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];
    if (argument === "--") continue;
    if (argument === "--headed") parsed.headed = true;
    else if (argument === "--enforce") parsed.enforce = true;
    else if (argument === "--compare") parsed.compare = true;
    else if (argument === "--update-baseline") parsed.updateBaseline = true;
    else if (argument === "--skip-core-build") parsed.skipCoreBuild = true;
    else if (argument === "--skip-package-build") {
      parsed.skipPackageBuild = true;
    } else if (argument === "--browser") parsed.browser = arguments_[++index];
    else if (argument === "--dpr") parsed.dpr = positiveNumber(arguments_[++index], "--dpr");
    else if (argument === "--points")
      parsed.points = positiveInteger(arguments_[++index], "--points");
    else if (argument === "--series")
      parsed.series = positiveInteger(arguments_[++index], "--series");
    else if (argument === "--samples")
      parsed.samples = positiveInteger(arguments_[++index], "--samples");
    else if (argument === "--warmup")
      parsed.warmup = positiveInteger(arguments_[++index], "--warmup");
    else if (argument === "--output") parsed.output = arguments_[++index];
    else if (argument === "--baseline") parsed.baseline = arguments_[++index];
    else if (argument === "--source-root") {
      parsed.sourceRoot = arguments_[++index];
    } else throw new Error(`Unknown argument ${JSON.stringify(argument)}.`);
  }
  return parsed;
}

function positiveNumber(value, flag) {
  const parsed = Number(value);
  if (!(parsed > 0)) throw new Error(`${flag} requires a positive number.`);
  return parsed;
}

function positiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive integer.`);
  }
  return parsed;
}

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: sourceRoot,
    env: {
      ...process.env,
      PWD: sourceRoot,
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(" ")} exited ${result.status}.`);
  }
}

function compareWithBaseline(result, baseline, { enforceReference }) {
  const baselineCase = findBaselineCase(baseline, result.scenario);
  const budgets = baselineCase?.budgets ?? baseline.defaultBudgets;
  const failures = [];
  const p95 = result.results.frameTimeMs.p95;
  const maxVertices = result.results.presentationVertices.max;
  const maxVisits = result.results.presentationQueryVisits.max;
  if (!budgets) {
    failures.push("no absolute budget exists for this benchmark scenario");
  }
  if (budgets && p95 > budgets.p95FrameTimeMs) {
    failures.push(`p95 frame time ${p95} ms > ${budgets.p95FrameTimeMs} ms`);
  }
  if (budgets && maxVertices > budgets.maxPresentationVertices) {
    failures.push(`presentation vertices ${maxVertices} > ${budgets.maxPresentationVertices}`);
  }
  if (budgets && maxVisits > budgets.maxPresentationQueryVisits) {
    failures.push(`presentation query visits ${maxVisits} > ${budgets.maxPresentationQueryVisits}`);
  }

  const reference = findBenchmarkReference(baselineCase, result.environment);
  const comparableReference = Boolean(reference);
  const referenceP95 = reference?.results?.frameTimeMs?.p95;
  const p95FrameTimeDeltaPercent =
    typeof referenceP95 === "number" && referenceP95 > 0
      ? Number((((p95 - referenceP95) / referenceP95) * 100).toFixed(1))
      : null;
  const p95FrameTimeDeltaMs =
    typeof referenceP95 === "number" ? Number((p95 - referenceP95).toFixed(3)) : null;
  const maxRegressionPercent = baseline.maxRegressionPercent ?? 3;
  const maxRegressionMilliseconds = baseline.maxRegressionMilliseconds ?? 1;
  if (enforceReference && !comparableReference) {
    failures.push("no committed comparison reference matches this scenario");
  } else if (
    enforceReference &&
    p95FrameTimeDeltaPercent !== null &&
    exceedsRegressionTolerance({
      percentDelta: p95FrameTimeDeltaPercent,
      millisecondDelta: p95FrameTimeDeltaMs,
      maxRegressionPercent,
      maxRegressionMilliseconds,
    })
  ) {
    failures.push(
      `p95 frame time regressed ${p95FrameTimeDeltaPercent}% / ${p95FrameTimeDeltaMs} ms; ` +
        `limits are ${maxRegressionPercent}% / ${maxRegressionMilliseconds} ms`,
    );
  }
  return {
    budgets,
    failures,
    maxRegressionPercent,
    maxRegressionMilliseconds,
    referenceComparable: comparableReference,
    referenceP95FrameTimeMs: referenceP95 ?? null,
    p95FrameTimeDeltaPercent,
    p95FrameTimeDeltaMs,
  };
}

function findBaselineCase(baseline, scenario) {
  if (baseline.schemaVersion === 1) {
    return sameReferenceScenario(scenario, baseline.scenario) ? baseline : null;
  }
  return baseline.cases?.find((entry) => sameReferenceScenario(scenario, entry.scenario)) ?? null;
}

function updateBaselineReference(baseline, result) {
  if (baseline.schemaVersion !== 2 || !Array.isArray(baseline.cases)) {
    throw new Error("Updating references requires a schemaVersion 2 baseline with scenario cases.");
  }
  const baselineCase = findBaselineCase(baseline, result.scenario);
  if (!baselineCase) {
    throw new Error(
      `No baseline case matches ${JSON.stringify(referenceScenario(result.scenario))}.`,
    );
  }
  upsertBenchmarkReference(baselineCase, result);
}

function referenceScenario(scenario) {
  return {
    pointCount: scenario.pointCount,
    seriesCount: scenario.seriesCount,
    cssWidth: scenario.cssWidth,
    cssHeight: scenario.cssHeight,
    devicePixelRatio: scenario.devicePixelRatio,
  };
}

function sameReferenceScenario(actual, expected) {
  if (!expected) return false;
  const normalized = referenceScenario(actual);
  return Object.entries(normalized).every(([key, value]) => expected[key] === value);
}

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js") || file.endsWith(".mjs")) {
    return "text/javascript; charset=utf-8";
  }
  if (file.endsWith(".json") || file.endsWith(".map")) {
    return "application/json; charset=utf-8";
  }
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}
