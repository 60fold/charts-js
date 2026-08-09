import { LineChart } from "/packages/line/dist-benchmark/index.js";

globalThis.__SIXTYFOLD_BENCHMARK_STAGE__ = "module-loaded";
const query = new URLSearchParams(location.search);
const pointCount = positiveInteger(query.get("points"), 600_000);
const seriesCount = positiveInteger(query.get("series"), 4);
const sampleCount = positiveInteger(query.get("samples"), 40);
const warmupCount = positiveInteger(query.get("warmup"), 10);

const canvas = document.querySelector("#chart");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Benchmark canvas is missing.");
}

const chart = new LineChart(canvas, {
  animated: false,
  renderMode: "main",
  chartBackground: "#111a2d",
  grid: { color: "#263b60" },
  legend: {
    visible: true,
    position: "top",
    layout: "row",
  },
  lod: {
    mode: "adaptive",
    density: 0.75,
    rebaseRatio: 1.25,
    quantizationStep: 0.25,
  },
  rangeSelector: { visible: false },
  series: createSeriesOptions(seriesCount),
});
globalThis.__SIXTYFOLD_BENCHMARK_STAGE__ = "chart-created";

const statsQueue = [];
const statsWaiters = [];
const handleStats = (stats) => {
  const waiter = statsWaiters.shift();
  if (waiter) waiter.resolve(stats);
  else statsQueue.push(stats);
};

await chart.initialize();
globalThis.__SIXTYFOLD_BENCHMARK_STAGE__ = "chart-initialized";
chart.setStatsCallback(handleStats, { intervalMs: 16 });
const data = createData(pointCount, seriesCount);
chart.setMultiSeriesData(data);
globalThis.__SIXTYFOLD_BENCHMARK_STAGE__ = "data-installed";

await nextStats(20_000);
globalThis.__SIXTYFOLD_BENCHMARK_STAGE__ = "first-stats";
// Hierarchy construction is staged and does not promise a dedicated stats
// event when the final level completes. Let the initial stages settle, then
// discard their queued evidence so each sample belongs to its viewport command.
await delay(500);
statsQueue.length = 0;

const samples = [];
for (let index = 0; index < warmupCount + sampleCount; index++) {
  globalThis.__SIXTYFOLD_BENCHMARK_STAGE__ = `sample-${index}`;
  await delay(20);
  statsQueue.length = 0;
  const viewportFraction = 0.18 + (index % 4) * 0.015;
  const viewportWidth = Math.max(100, Math.floor(pointCount * viewportFraction));
  const travel = Math.max(1, pointCount - viewportWidth - 1);
  const phase = (((index * 0.173) % 1) + 1) % 1;
  const xMin = Math.floor(travel * phase);
  // Reset the stats emission deadline so the measured render cannot be
  // skipped at the 16 ms boundary by timer quantization.
  chart.setStatsCallback(handleStats, { intervalMs: 16 });
  const pendingStats = nextStats(10_000);
  chart.setViewport({ xMin, xMax: xMin + viewportWidth }, { animated: false });
  const frameStats = await pendingStats;
  if (index >= warmupCount) samples.push(normalizeStats(frameStats));
}

chart.destroy();
globalThis.__SIXTYFOLD_BENCHMARK_STAGE__ = "complete";
globalThis.__SIXTYFOLD_BENCHMARK_RESULT__ = summarize(samples, {
  pointCount,
  seriesCount,
  sampleCount,
  warmupCount,
  cssWidth: 1200,
  cssHeight: 720,
  devicePixelRatio,
});

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function nextStats(timeoutMs) {
  const queued = statsQueue.shift();
  if (queued) return Promise.resolve(queued);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const index = statsWaiters.indexOf(waiter);
      if (index >= 0) statsWaiters.splice(index, 1);
      reject(new Error(`Timed out after ${timeoutMs} ms waiting for renderer stats.`));
    }, timeoutMs);
    const waiter = {
      resolve(value) {
        clearTimeout(timeout);
        resolve(value);
      },
    };
    statsWaiters.push(waiter);
  });
}

function createSeriesOptions(count) {
  const colors = ["#49d3ff", "#ffb02e", "#9d7cff", "#4ee6a8"];
  return Array.from({ length: count }, (_, index) => {
    const group = Math.floor(index / 4) + 1;
    switch (index % 4) {
      case 0:
        return {
          name: `Telemetry ${group}`,
          color: colors[index % colors.length],
          type: "line",
        };
      case 1:
        return {
          name: `Controller ${group}`,
          color: colors[index % colors.length],
          type: "step-after",
        };
      case 2:
        return {
          name: `Envelope ${group}`,
          color: colors[index % colors.length],
          type: "range",
          width: 0,
          band: {
            fillColor: colors[index % colors.length],
            fillOpacity: 0.2,
          },
        };
      default:
        return {
          name: `Events ${group}`,
          color: colors[index % colors.length],
          type: "bar",
          bar: { widthRatio: 0.7 },
        };
    }
  });
}

function createData(length, count) {
  const x = new Float64Array(length);
  const series = createSeriesData(count, length);

  for (let index = 0; index < length; index++) {
    const slow = Math.sin(index / 19_000) * 18;
    const fast = Math.sin(index / 173) * 2.5;
    const center = 80 + slow + fast;
    x[index] = index;
    for (let seriesIndex = 0; seriesIndex < count; seriesIndex++) {
      const groupOffset = Math.floor(seriesIndex / 4) * 3;
      const phaseOffset = seriesIndex * 17;
      const target = series[seriesIndex];
      switch (seriesIndex % 4) {
        case 0:
          target[index] = center + groupOffset + Math.sin((index + phaseOffset) / 31) * 0.8;
          break;
        case 1:
          target[index] = 58 + groupOffset + Math.floor((index % 12_000) / 3_000) * 4;
          break;
        case 2: {
          const range = target;
          const width = 7 + Math.sin((index + phaseOffset) / 900) * 1.5;
          range.low[index] = center + groupOffset - width;
          range.high[index] = center + groupOffset + width;
          break;
        }
        default:
          target[index] =
            (index + phaseOffset) % 7_919 < 8 ? 20 + groupOffset + (index % 5) * 3 : 0;
      }
    }
  }

  return {
    x,
    series,
    length,
    seriesCount: count,
  };
}

function createSeriesData(count, length) {
  return Array.from({ length: count }, (_, index) =>
    index % 4 === 2
      ? { low: new Float64Array(length), high: new Float64Array(length) }
      : new Float64Array(length),
  );
}

function normalizeStats(stats) {
  return {
    frameTimeMs: Number(stats.frameTime),
    presentationVertices: stats.presentationVertices,
    presentationQueryVisits: stats.presentationQueryVisits,
    presentationColumns: stats.presentationColumns,
    benchmarkPhases: stats.benchmarkPhases,
    benchmarkWork: stats.benchmarkWork,
  };
}

function summarize(samples, scenario) {
  const frameTimes = samples.map((sample) => sample.frameTimeMs);
  const phaseNames = Object.keys(samples[0]?.benchmarkPhases ?? {});
  const phases = Object.fromEntries(
    phaseNames.map((name) => {
      const values = samples.map((sample) => sample.benchmarkPhases[name]);
      return [
        name,
        {
          median: percentile(values, 0.5),
          p95: percentile(values, 0.95),
        },
      ];
    }),
  );

  return {
    schemaVersion: 1,
    scenario,
    results: {
      frameTimeMs: {
        median: percentile(frameTimes, 0.5),
        p95: percentile(frameTimes, 0.95),
        max: Math.max(...frameTimes),
      },
      presentationVertices: summarizeInteger(samples.map((sample) => sample.presentationVertices)),
      presentationQueryVisits: summarizeInteger(
        samples.map((sample) => sample.presentationQueryVisits),
      ),
      presentationColumns: summarizeInteger(samples.map((sample) => sample.presentationColumns)),
      phases,
      lastWork: samples.at(-1)?.benchmarkWork ?? null,
    },
  };
}

function summarizeInteger(values) {
  return {
    median: percentile(values, 0.5),
    max: Math.max(...values),
  };
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Number(sorted[index].toFixed(3));
}
