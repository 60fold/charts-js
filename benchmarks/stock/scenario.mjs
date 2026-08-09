import { StockChart } from "/packages/stock/dist/index.js";

globalThis.__SIXTYFOLD_STOCK_BENCHMARK_STAGE__ = "module-loaded";
const query = new URLSearchParams(location.search);
const pointCount = positiveInteger(query.get("points"), 600_000);
const sampleCount = positiveInteger(query.get("samples"), 40);
const warmupCount = positiveInteger(query.get("warmup"), 10);
const cssWidth = positiveInteger(query.get("width"), 6144);
const cssHeight = positiveInteger(query.get("height"), 3456);
const profile = query.get("profile") === "analytics" ? "analytics" : "plain";

const canvas = document.querySelector("#chart");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Benchmark canvas is missing.");
}
canvas.style.width = `${cssWidth}px`;
canvas.style.height = `${cssHeight}px`;

const chart = new StockChart(canvas, {
  animated: false,
  renderMode: "main",
  chartBackground: "#111a2d",
  grid: { color: "#263b60" },
  rangeSelector: { visible: false },
  showVolume: true,
  indicators:
    profile === "analytics"
      ? [
          { type: "sma", period: 20 },
          { type: "ema", period: 50 },
          { type: "bollinger", period: 20 },
          { type: "vwap", reset: "day" },
        ]
      : [],
  volumeProfile: profile === "analytics" ? { visible: true, rows: 48, width: 120 } : false,
});
globalThis.__SIXTYFOLD_STOCK_BENCHMARK_STAGE__ = "chart-created";

const statsQueue = [];
const statsWaiters = [];
const handleStats = (stats) => {
  const waiter = statsWaiters.shift();
  if (waiter) waiter.resolve(stats);
  else statsQueue.push(stats);
};

await chart.initialize();
globalThis.__SIXTYFOLD_STOCK_BENCHMARK_STAGE__ = "chart-initialized";
chart.setStatsCallback(handleStats, { intervalMs: 16 });
const data = createData(pointCount);
chart.setData(data);
globalThis.__SIXTYFOLD_STOCK_BENCHMARK_STAGE__ = "data-installed";

await waitForLODReady(20_000);
globalThis.__SIXTYFOLD_STOCK_BENCHMARK_STAGE__ = "lod-ready";
await delay(100);
statsQueue.length = 0;

const minute = 60_000;
const day = 24 * 60 * minute;
const samples = [];
for (let index = 0; index < warmupCount + sampleCount; index++) {
  globalThis.__SIXTYFOLD_STOCK_BENCHMARK_STAGE__ = `sample-${index}`;
  await delay(20);
  statsQueue.length = 0;
  // Keep the 5m LOD just below the renderer's six-CSS-pixel candle target.
  // This exercises roughly 860-1,000 rendered candles instead of allowing a
  // coarser level to hide accessor or drawing regressions.
  const viewportWidth = day * (3 + (index % 4) * 0.15);
  const dataWidth = data.timestamp[data.length - 1] - data.timestamp[0];
  const travel = Math.max(minute, dataWidth - viewportWidth);
  const phase = (((index * 0.173) % 1) + 1) % 1;
  const xMin = data.timestamp[0] + travel * phase;
  chart.setStatsCallback(handleStats, { intervalMs: 16 });
  const pendingStats = nextStats(10_000);
  chart.setViewport({ xMin, xMax: xMin + viewportWidth }, { animated: false });
  const frameStats = await pendingStats;
  if (index >= warmupCount) {
    samples.push({
      frameTimeMs: Number(frameStats.frameTime),
      renderedCandles: frameStats.renderedCandles,
      visibleCandles: frameStats.visibleCandles,
      lodLevel: frameStats.lodLevel,
    });
  }
}

chart.destroy();
globalThis.__SIXTYFOLD_STOCK_BENCHMARK_STAGE__ = "complete";
globalThis.__SIXTYFOLD_STOCK_BENCHMARK_RESULT__ = summarize(samples, {
  pointCount,
  profile,
  sampleCount,
  warmupCount,
  cssWidth,
  cssHeight,
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

async function waitForLODReady(timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const stats = await nextStats(Math.max(1, deadline - performance.now()));
    if (stats.lodReady) return stats;
  }
  throw new Error(`Timed out after ${timeoutMs} ms waiting for stock LOD.`);
}

function createData(length) {
  const timestamp = new Float64Array(length);
  const open = new Float64Array(length);
  const high = new Float64Array(length);
  const low = new Float64Array(length);
  const close = new Float64Array(length);
  const volume = new Float64Array(length);
  const start = Date.UTC(2025, 0, 1);
  let previousClose = 60_000;
  for (let index = 0; index < length; index++) {
    const slow = Math.sin(index / 17_000) * 2_400;
    const fast = Math.sin(index / 173) * 180;
    const nextClose = 60_000 + slow + fast;
    const spread = 35 + Math.abs(Math.sin(index / 31)) * 65;
    timestamp[index] = start + index * 60_000;
    open[index] = previousClose;
    high[index] = Math.max(previousClose, nextClose) + spread;
    low[index] = Math.min(previousClose, nextClose) - spread;
    close[index] = nextClose;
    volume[index] = 4 + Math.abs(Math.sin(index / 19)) * 18;
    previousClose = nextClose;
  }
  return { timestamp, open, high, low, close, volume, length };
}

function summarize(samples, scenario) {
  const frameTimes = samples.map((sample) => sample.frameTimeMs);
  return {
    schemaVersion: 1,
    scenario,
    results: {
      frameTimeMs: {
        median: percentile(frameTimes, 0.5),
        p95: percentile(frameTimes, 0.95),
        max: Math.max(...frameTimes),
      },
      renderedCandles: summarizeInteger(samples.map((sample) => sample.renderedCandles)),
      visibleCandles: summarizeInteger(samples.map((sample) => sample.visibleCandles)),
      lodLevel: summarizeInteger(samples.map((sample) => sample.lodLevel)),
    },
  };
}

function summarizeInteger(values) {
  return {
    median: Math.round(percentile(values, 0.5)),
    max: Math.max(...values),
  };
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Number(sorted[index].toFixed(2));
}
