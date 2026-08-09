export const LINE_SAMPLE_COUNT = 1_000_000;
export const STOCK_CANDLE_COUNT = 1_000_000;
export const LINE_VALUE_COUNT = LINE_SAMPLE_COUNT * 5;
export const STOCK_VALUE_COUNT = STOCK_CANDLE_COUNT * 6;

export const LINE_WORKLOAD_LABEL = "1,000,000 timestamps · 5,000,000 latency values";
export const STOCK_WORKLOAD_LABEL = "1,000,000 candles · 6,000,000 OHLCV values";

export interface LineDemoData {
  x: Float64Array;
  series: Array<Float64Array | { low: Float64Array; high: Float64Array }>;
  length: number;
  seriesCount: number;
}

export interface StockDemoData {
  timestamp: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
  length: number;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/**
 * Generate a deterministic inference-serving trace.
 *
 * One million timestamps feed four logical series. The range series owns two
 * value columns, so the renderer receives five million numeric latency values.
 */
export function createInferenceLatencyData(count = LINE_SAMPLE_COUNT): LineDemoData {
  const x = new Float64Array(count);
  const envelopeLow = new Float64Array(count);
  const envelopeHigh = new Float64Array(count);
  const median = new Float64Array(count);
  const tail = new Float64Array(count);
  const budget = new Float64Array(count);
  const random = createRandom(0x60f01d);
  const start = Date.UTC(2025, 10, 17);

  for (let index = 0; index < count; index++) {
    const noise = random() + random() - 1;
    const trafficCycle = Math.sin(index / 5_400) * 4.2 + Math.sin(index / 31_000) * 2.8;
    const incidentPhase = index % 125_000;
    const incident = incidentPhase < 7_500 ? Math.sin((Math.PI * incidentPhase) / 7_500) * 34 : 0;
    const p50 = 24 + trafficCycle + noise * 1.8;
    const p99 = p50 + 17 + Math.abs(noise) * 5 + incident;

    x[index] = start + index * 250;
    median[index] = p50;
    tail[index] = p99;
    envelopeLow[index] = Math.max(0, p50 - 3.5 - random() * 2);
    envelopeHigh[index] = p99 + 5 + random() * 4;
    budget[index] = index % 300_000 < 150_000 ? 68 : 75;
  }

  return {
    x,
    series: [{ low: envelopeLow, high: envelopeHigh }, median, tail, budget],
    length: count,
    seriesCount: 4,
  };
}

/**
 * Generate deterministic one-minute OHLCV candles with changing volatility,
 * volume bursts, and slow market regimes.
 */
export function createSyntheticMarketData(count = STOCK_CANDLE_COUNT): StockDemoData {
  const timestamp = new Float64Array(count);
  const open = new Float64Array(count);
  const high = new Float64Array(count);
  const low = new Float64Array(count);
  const close = new Float64Array(count);
  const volume = new Float64Array(count);
  const random = createRandom(0xc0ffee);
  const start = Date.UTC(2024, 0, 1);
  let previous = 420;

  for (let index = 0; index < count; index++) {
    const target = 420 + Math.sin(index / 80_000) * 34 + Math.sin(index / 17_000) * 16;
    const newsPhase = index % 175_000;
    const news = newsPhase < 1_200 ? Math.sin((Math.PI * newsPhase) / 1_200) * 1.35 : 0;
    const shock = (random() + random() + random() - 1.5) * 0.75;
    const next = Math.max(20, previous + (target - previous) * 0.002 + shock + news);
    const wickUp = 0.2 + random() * 0.9 + Math.max(0, next - previous) * 0.35;
    const wickDown = 0.2 + random() * 0.9 + Math.max(0, previous - next) * 0.35;

    timestamp[index] = start + index * 60_000;
    open[index] = previous;
    close[index] = next;
    high[index] = Math.max(previous, next) + wickUp;
    low[index] = Math.min(previous, next) - wickDown;
    volume[index] =
      2_400 + random() * 5_000 + Math.abs(next - previous) * 2_200 + Math.abs(news) * 8_000;
    previous = next;
  }

  return { timestamp, open, high, low, close, volume, length: count };
}

export function createLineOptions() {
  return {
    animated: false,
    labels: {
      top: { text: "Million-point inference latency" },
      left: { text: "Latency (ms)" },
    },
    legend: {
      visible: true,
      position: "top" as const,
      layout: "row" as const,
      interactive: true,
    },
    lod: { mode: "adaptive" as const, density: 0.75 },
    series: [
      {
        name: "Observed envelope",
        type: "range" as const,
        color: "#7557ff",
        width: 0,
        band: { fill: 0.16, borderWidth: 0 },
      },
      { name: "p50", color: "#5ee7f7", width: 1.5 },
      { name: "p99", color: "#ff5ca8", width: 1.5 },
      {
        name: "SLO budget",
        type: "step-after" as const,
        color: "#ffc857",
        width: 1.2,
      },
    ],
  };
}

export function createStockOptions(data: StockDemoData) {
  const markerIndex = Math.min(data.length - 1, Math.floor(data.length * 0.72));
  return {
    animated: false,
    labels: {
      top: { text: "Million-candle market analytics" },
      right: { text: "Price" },
    },
    showVolume: true,
    volumeHeightRatio: 0.18,
    indicators: [
      { type: "sma" as const, period: 50, label: "SMA 50", color: "#5ee7f7" },
      { type: "ema" as const, period: 200, label: "EMA 200", color: "#ff5ca8" },
    ],
    volumeProfile: {
      rows: 32,
      width: 72,
      placement: "left" as const,
      opacity: 0.16,
      showPointOfControl: true,
    },
    priceLines: [
      {
        price: data.close[data.length - 1],
        label: "Latest",
        color: "#ffc857",
        lineDash: [5, 4],
        showAxisLabel: true,
      },
    ],
    markers: [
      {
        timestamp: data.timestamp[markerIndex],
        position: "above" as const,
        shape: "diamond" as const,
        label: "Model release",
        color: "#7557ff",
      },
    ],
  };
}

export function markChartReady(): void {
  const root = document.documentElement;
  const ready = Number.parseInt(root.dataset.sixtyfoldReady ?? "0", 10) + 1;
  root.dataset.sixtyfoldReady = String(ready);
}
