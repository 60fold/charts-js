import type { OHLCVData } from "./ohlcv.js";
import { shouldRebaseRollingVariance } from "./rollingVariance.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Price column or derived price used as indicator input. */
export type StockPriceSource = "open" | "high" | "low" | "close" | "hl2" | "hlc3" | "ohlc4";

export type StockIndicatorLineDash = "solid" | "dashed" | "dotted";

/** Renderer-facing metadata shared by all indicators. Calculations ignore it. */
export interface StockIndicatorStyle {
  id?: string;
  label?: string;
  visible?: boolean;
  color?: string;
  lineWidth?: number;
  lineDash?: StockIndicatorLineDash;
  includeInScale?: boolean;
}

export interface SMAIndicatorConfig extends StockIndicatorStyle {
  type: "sma";
  period: number;
  /** Defaults to close. */
  source?: StockPriceSource;
}

export interface EMAIndicatorConfig extends StockIndicatorStyle {
  type: "ema";
  period: number;
  /** Defaults to close. */
  source?: StockPriceSource;
}

export interface BollingerBandsIndicatorConfig extends StockIndicatorStyle {
  type: "bollinger";
  period: number;
  /** Standard-deviation multiplier. Defaults to 2. */
  deviation?: number;
  /** Defaults to close. */
  source?: StockPriceSource;
  middleColor?: string;
  upperColor?: string;
  lowerColor?: string;
  fillColor?: string;
  fillOpacity?: number;
}

export type VWAPReset = "day" | "week" | "none";

export interface VWAPCalculationOptions {
  /** Defaults to the typical price, hlc3. */
  source?: StockPriceSource;
  /** UTC-aligned accumulation window. Defaults to day. */
  reset?: VWAPReset;
  /** Moves the UTC reset boundary by this many milliseconds. Defaults to 0. */
  resetOffsetMs?: number;
}

export interface VWAPIndicatorConfig extends VWAPCalculationOptions, StockIndicatorStyle {
  type: "vwap";
}

/** Declarative stock indicator configuration. */
export type StockIndicator =
  SMAIndicatorConfig | EMAIndicatorConfig | BollingerBandsIndicatorConfig | VWAPIndicatorConfig;

export interface ComputedStockIndicatorLine<Name extends string = string> {
  readonly name: Name;
  readonly values: Float64Array;
}

/** Named line arrays produced by a stock indicator calculation. */
export type ComputedStockIndicator =
  | {
      readonly type: "sma";
      readonly lines: readonly ComputedStockIndicatorLine<"sma">[];
    }
  | {
      readonly type: "ema";
      readonly lines: readonly ComputedStockIndicatorLine<"ema">[];
    }
  | {
      readonly type: "bollinger";
      readonly lines: readonly ComputedStockIndicatorLine<"middle" | "upper" | "lower">[];
    }
  | {
      readonly type: "vwap";
      readonly lines: readonly ComputedStockIndicatorLine<"vwap">[];
    };

export interface BollingerBandsResult {
  readonly middle: Float64Array;
  readonly upper: Float64Array;
  readonly lower: Float64Array;
}

function createNaNArray(length: number): Float64Array {
  const result = new Float64Array(length);
  result.fill(Number.NaN);
  return result;
}

function validatePeriod(period: number): void {
  if (!Number.isInteger(period) || period <= 0) {
    throw new RangeError("Indicator period must be a positive integer");
  }
}

function validateDeviation(deviation: number): void {
  if (!Number.isFinite(deviation) || deviation < 0) {
    throw new RangeError("Bollinger Bands deviation must be a finite non-negative number");
  }
}

function validateOHLCV(data: OHLCVData): number {
  const length = data.timestamp.length;
  if (
    data.open.length !== length ||
    data.high.length !== length ||
    data.low.length !== length ||
    data.close.length !== length ||
    data.volume.length !== length
  ) {
    throw new RangeError("OHLCV columns must all have the same length");
  }
  if (data.length !== length) {
    throw new RangeError("OHLCV length must match the column length");
  }
  return length;
}

function combinePrices(length: number, columns: readonly Float64Array[]): Float64Array {
  const result = createNaNArray(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    let valid = true;
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      const value = columns[columnIndex][i];
      if (!Number.isFinite(value)) {
        valid = false;
        break;
      }
      sum += value;
    }
    if (valid) result[i] = sum / columns.length;
  }
  return result;
}

function resolvePriceSource(data: OHLCVData, source: StockPriceSource): Float64Array {
  const length = validateOHLCV(data);
  switch (source) {
    case "open":
      return data.open;
    case "high":
      return data.high;
    case "low":
      return data.low;
    case "close":
      return data.close;
    case "hl2":
      return combinePrices(length, [data.high, data.low]);
    case "hlc3":
      return combinePrices(length, [data.high, data.low, data.close]);
    case "ohlc4":
      return combinePrices(length, [data.open, data.high, data.low, data.close]);
    default:
      throw new RangeError(`Unsupported stock price source: ${String(source)}`);
  }
}

/**
 * Calculate a simple moving average in O(n).
 *
 * A non-finite value breaks the contiguous window. Output resumes only after
 * `period` consecutive finite values have been observed.
 */
export function calculateSMA(values: Float64Array, period: number): Float64Array {
  validatePeriod(period);
  const result = createNaNArray(values.length);
  let mean = 0;
  let count = 0;

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) {
      mean = 0;
      count = 0;
      continue;
    }

    if (count < period) {
      count++;
      mean += (value - mean) / count;
    } else {
      mean += (value - values[i - period]) / period;
    }
    if (count === period) result[i] = mean;
  }

  return result;
}

/**
 * Calculate an exponential moving average in O(n), seeded by a period SMA.
 * A non-finite value resets the seed warmup.
 */
export function calculateEMA(values: Float64Array, period: number): Float64Array {
  validatePeriod(period);
  const result = createNaNArray(values.length);
  const alpha = 2 / (period + 1);
  let consecutive = 0;
  let seedSum = 0;
  let ema = Number.NaN;

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) {
      consecutive = 0;
      seedSum = 0;
      ema = Number.NaN;
      continue;
    }

    if (consecutive < period) {
      seedSum += value;
      consecutive++;
      if (consecutive === period) {
        ema = seedSum / period;
        result[i] = ema;
      }
      continue;
    }

    ema += alpha * (value - ema);
    result[i] = ema;
  }

  return result;
}

/**
 * Calculate population-standard-deviation Bollinger Bands in O(n).
 * A non-finite value breaks the contiguous rolling window.
 */
export function calculateBollingerBands(
  values: Float64Array,
  period: number,
  deviation = 2,
): BollingerBandsResult {
  validatePeriod(period);
  validateDeviation(deviation);

  const middle = createNaNArray(values.length);
  const upper = createNaNArray(values.length);
  const lower = createNaNArray(values.length);
  let count = 0;
  let mean = 0;
  let m2 = 0;

  for (let i = 0; i < values.length; i++) {
    const added = values[i];
    if (!Number.isFinite(added)) {
      count = 0;
      mean = 0;
      m2 = 0;
      continue;
    }

    if (count === period) {
      const removed = values[i - period];
      let shouldRebase = false;
      if (period === 1) {
        count = 0;
        mean = 0;
        m2 = 0;
      } else {
        const nextCount = count - 1;
        const nextMean = mean - (removed - mean) / nextCount;
        const removedContribution = (removed - mean) * (removed - nextMean);
        const nextM2 = m2 - removedContribution;
        shouldRebase = shouldRebaseRollingVariance(nextM2, removedContribution);
        m2 = Math.max(0, nextM2);
        mean = nextMean;
        count = nextCount;
      }

      if (shouldRebase) {
        count = 0;
        mean = 0;
        m2 = 0;
        for (let windowIndex = i - period + 1; windowIndex <= i; windowIndex++) {
          const value = values[windowIndex];
          const nextCount = count + 1;
          const delta = value - mean;
          mean += delta / nextCount;
          m2 += delta * (value - mean);
          count = nextCount;
        }
      } else {
        count++;
        const delta = added - mean;
        mean += delta / count;
        m2 += delta * (added - mean);
      }
    } else {
      count++;
      const delta = added - mean;
      mean += delta / count;
      m2 += delta * (added - mean);
    }

    if (count < period) continue;

    const variance = Math.max(0, m2 / period);
    const width = Math.sqrt(variance) * deviation;
    middle[i] = mean;
    upper[i] = mean + width;
    lower[i] = mean - width;
  }

  return { middle, upper, lower };
}

function validateVWAPOptions(options: VWAPCalculationOptions): {
  source: StockPriceSource;
  reset: VWAPReset;
  resetOffsetMs: number;
} {
  const source = options.source ?? "hlc3";
  const reset = options.reset ?? "day";
  const resetOffsetMs = options.resetOffsetMs ?? 0;

  if (reset !== "day" && reset !== "week" && reset !== "none") {
    throw new RangeError(`Unsupported VWAP reset: ${String(reset)}`);
  }
  if (!Number.isFinite(resetOffsetMs)) {
    throw new RangeError("VWAP resetOffsetMs must be finite");
  }

  return { source, reset, resetOffsetMs };
}

function getVWAPBucket(timestamp: number, reset: VWAPReset, resetOffsetMs: number): number {
  if (reset === "none") return 0;
  const shifted = timestamp - resetOffsetMs;
  if (reset === "day") return Math.floor(shifted / DAY_MS);

  // Unix epoch was a Thursday. Adding three days makes bucket boundaries fall
  // on Monday 00:00 UTC (then resetOffsetMs moves that boundary if requested).
  return Math.floor((shifted + 3 * DAY_MS) / WEEK_MS);
}

/**
 * Calculate volume-weighted average price in O(n).
 *
 * Daily and weekly resets use UTC boundaries. Invalid timestamps, source
 * prices, or negative/non-finite volumes break the contiguous accumulation.
 */
export function calculateVWAP(data: OHLCVData, options: VWAPCalculationOptions = {}): Float64Array {
  const length = validateOHLCV(data);
  const { source, reset, resetOffsetMs } = validateVWAPOptions(options);
  const prices = resolvePriceSource(data, source);
  const result = createNaNArray(length);
  let activeBucket: number | undefined;
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < length; i++) {
    const timestamp = data.timestamp[i];
    if (!Number.isFinite(timestamp)) {
      activeBucket = undefined;
      cumulativePriceVolume = 0;
      cumulativeVolume = 0;
      continue;
    }

    const bucket = getVWAPBucket(timestamp, reset, resetOffsetMs);
    if (activeBucket === undefined || bucket !== activeBucket) {
      activeBucket = bucket;
      cumulativePriceVolume = 0;
      cumulativeVolume = 0;
    }

    const price = prices[i];
    const volume = data.volume[i];
    if (!Number.isFinite(price) || !Number.isFinite(volume) || volume < 0) {
      cumulativePriceVolume = 0;
      cumulativeVolume = 0;
      continue;
    }

    cumulativePriceVolume += price * volume;
    cumulativeVolume += volume;
    if (
      cumulativeVolume > 0 &&
      Number.isFinite(cumulativePriceVolume) &&
      Number.isFinite(cumulativeVolume)
    ) {
      result[i] = cumulativePriceVolume / cumulativeVolume;
    } else if (!Number.isFinite(cumulativePriceVolume)) {
      cumulativePriceVolume = 0;
      cumulativeVolume = 0;
    }
  }

  return result;
}

/** Compute one declarative indicator and return its named line arrays. */
export function computeStockIndicator(
  data: OHLCVData,
  indicator: StockIndicator,
): ComputedStockIndicator {
  switch (indicator.type) {
    case "sma": {
      const values = resolvePriceSource(data, indicator.source ?? "close");
      return {
        type: "sma",
        lines: [{ name: "sma", values: calculateSMA(values, indicator.period) }],
      };
    }
    case "ema": {
      const values = resolvePriceSource(data, indicator.source ?? "close");
      return {
        type: "ema",
        lines: [{ name: "ema", values: calculateEMA(values, indicator.period) }],
      };
    }
    case "bollinger": {
      const values = resolvePriceSource(data, indicator.source ?? "close");
      const bands = calculateBollingerBands(values, indicator.period, indicator.deviation ?? 2);
      return {
        type: "bollinger",
        lines: [
          { name: "middle", values: bands.middle },
          { name: "upper", values: bands.upper },
          { name: "lower", values: bands.lower },
        ],
      };
    }
    case "vwap":
      return {
        type: "vwap",
        lines: [
          {
            name: "vwap",
            values: calculateVWAP(data, {
              source: indicator.source,
              reset: indicator.reset,
              resetOffsetMs: indicator.resetOffsetMs,
            }),
          },
        ],
      };
    default:
      throw new RangeError(
        `Unsupported stock indicator type: ${String((indicator as { type?: unknown }).type)}`,
      );
  }
}
