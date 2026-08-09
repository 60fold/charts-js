import {
  computeStockIndicator,
  type ComputedStockIndicator,
  type StockIndicator,
  type StockPriceSource,
} from "../analytics.js";
import type { OHLCVData } from "../ohlcv.js";
import { shouldRebaseRollingVariance } from "../rollingVariance.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export interface IndicatorRuntime {
  definition: StockIndicator;
  computed: ComputedStockIndicator;
  vwapBucket?: number;
  vwapPriceVolume: number;
  vwapVolume: number;
  rollingMean: number;
  rollingM2: number;
  rollingFiniteCount: number;
  rollingInvalid: number;
  rollingCount: number;
  emaValue: number;
  emaSeedSum: number;
  emaConsecutive: number;
}

export interface RawCandleValues {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface IndicatorDataSource {
  getStaticData(): OHLCVData | null;
  isRingBuffer(): boolean;
  getDataLength(): number;
  getRingCapacity(): number;
  getWriteIndex(): number;
  logicalToPhysicalIndex(index: number): number;
  getSourceAtPhysical(source: StockPriceSource | undefined, physicalIndex: number): number;
  getTimestampAtPhysical(physicalIndex: number): number;
  getVolumeAtPhysical(physicalIndex: number): number;
  onChange(): void;
}

export function getIndicatorLine(runtime: IndicatorRuntime, name: string): Float64Array | null {
  const line = runtime.computed.lines.find((entry) => entry.name === name);
  return line?.values ?? null;
}

export function getIndicatorLineColor(definition: StockIndicator, lineName: string): string {
  if (definition.type === "bollinger") {
    if (lineName === "upper") {
      return definition.upperColor ?? definition.color ?? "#94a3b8";
    }
    if (lineName === "lower") {
      return definition.lowerColor ?? definition.color ?? "#94a3b8";
    }
    return definition.middleColor ?? definition.color ?? "#fbbf24";
  }
  if (definition.color) return definition.color;
  if (definition.type === "sma") return "#f59e0b";
  if (definition.type === "ema") return "#38bdf8";
  return "#a78bfa";
}

export function getIndicatorLineDash(definition: StockIndicator): number[] {
  if (definition.lineDash === "dashed") return [6, 4];
  if (definition.lineDash === "dotted") return [2, 3];
  return [];
}

export function getSourceFromCandle(
  source: StockPriceSource | undefined,
  candle: RawCandleValues,
): number {
  switch (source ?? "close") {
    case "open":
      return candle.open;
    case "high":
      return candle.high;
    case "low":
      return candle.low;
    case "close":
      return candle.close;
    case "hl2":
      return (candle.high + candle.low) / 2;
    case "hlc3":
      return (candle.high + candle.low + candle.close) / 3;
    case "ohlc4":
      return (candle.open + candle.high + candle.low + candle.close) / 4;
  }
}

export function indicatorCalculationKey(definition: StockIndicator, index: number): string {
  const id = definition.id ? `id:${definition.id}` : `index:${index}`;
  if (definition.type === "vwap") {
    return `${id}|vwap|${definition.source ?? "hlc3"}|${definition.reset ?? "day"}|${definition.resetOffsetMs ?? 0}`;
  }
  if (definition.type === "bollinger") {
    return `${id}|bollinger|${definition.period}|${definition.source ?? "close"}|${definition.deviation ?? 2}`;
  }
  return `${id}|${definition.type}|${definition.period}|${definition.source ?? "close"}`;
}

function cloneIndicatorDefinition(definition: StockIndicator): StockIndicator {
  return {
    ...definition,
    lineDash: definition.lineDash,
  } as StockIndicator;
}

function getVWAPBucketForDefinition(
  timestamp: number,
  definition: Extract<StockIndicator, { type: "vwap" }>,
): number {
  if (definition.reset === "none") return 0;
  const offset = definition.resetOffsetMs ?? 0;
  const shifted = timestamp - offset;
  if ((definition.reset ?? "day") === "day") {
    return Math.floor(shifted / DAY_MS);
  }
  return Math.floor((shifted + 3 * DAY_MS) / WEEK_MS);
}

function createNaNValues(length: number): Float64Array {
  const values = new Float64Array(length);
  values.fill(Number.NaN);
  return values;
}

function createEmptyComputedIndicator(
  definition: StockIndicator,
  length: number,
): ComputedStockIndicator {
  switch (definition.type) {
    case "sma":
      return {
        type: "sma",
        lines: [{ name: "sma", values: createNaNValues(length) }],
      };
    case "ema":
      return {
        type: "ema",
        lines: [{ name: "ema", values: createNaNValues(length) }],
      };
    case "bollinger":
      return {
        type: "bollinger",
        lines: [
          { name: "middle", values: createNaNValues(length) },
          { name: "upper", values: createNaNValues(length) },
          { name: "lower", values: createNaNValues(length) },
        ],
      };
    case "vwap":
      return {
        type: "vwap",
        lines: [{ name: "vwap", values: createNaNValues(length) }],
      };
  }
}

function createIndicatorRuntime(
  definition: StockIndicator,
  computed: ComputedStockIndicator,
): IndicatorRuntime {
  return {
    definition,
    computed,
    vwapPriceVolume: 0,
    vwapVolume: 0,
    rollingMean: 0,
    rollingM2: 0,
    rollingFiniteCount: 0,
    rollingInvalid: 0,
    rollingCount: 0,
    emaValue: Number.NaN,
    emaSeedSum: 0,
    emaConsecutive: 0,
  };
}

function addRollingValue(runtime: IndicatorRuntime, value: number): void {
  const nextCount = runtime.rollingFiniteCount + 1;
  const delta = value - runtime.rollingMean;
  runtime.rollingMean += delta / nextCount;
  runtime.rollingM2 += delta * (value - runtime.rollingMean);
  runtime.rollingFiniteCount = nextCount;
}

function removeRollingValue(runtime: IndicatorRuntime, value: number): boolean {
  if (runtime.rollingFiniteCount <= 1) {
    runtime.rollingMean = 0;
    runtime.rollingM2 = 0;
    runtime.rollingFiniteCount = 0;
    return false;
  }

  const nextCount = runtime.rollingFiniteCount - 1;
  const nextMean = runtime.rollingMean - (value - runtime.rollingMean) / nextCount;
  const removedContribution = (value - runtime.rollingMean) * (value - nextMean);
  const nextM2 = runtime.rollingM2 - removedContribution;
  const shouldRebase = shouldRebaseRollingVariance(nextM2, removedContribution);
  runtime.rollingM2 = Math.max(0, nextM2);
  runtime.rollingMean = nextMean;
  runtime.rollingFiniteCount = nextCount;
  return shouldRebase;
}

export class StockIndicatorRuntime {
  declare readonly items: IndicatorRuntime[];
  declare private definitions: StockIndicator[];
  declare private readonly data: IndicatorDataSource;

  constructor(data: IndicatorDataSource) {
    this.items = [];
    this.definitions = [];
    this.data = data;
  }

  setDefinitions(next: readonly StockIndicator[] | null | undefined): void {
    this.definitions = Array.isArray(next) ? next.map(cloneIndicatorDefinition) : [];
    this.rebuild(true);
  }

  rebuild(reuseCompatible = false): void {
    const previous = this.items.slice();
    const staticData = this.data.isRingBuffer() ? null : this.data.getStaticData();
    if (!this.data.isRingBuffer() && !staticData) {
      this.replaceItems([]);
      return;
    }

    const previousByKey = new Map<string, IndicatorRuntime[]>();
    if (reuseCompatible) {
      for (let index = 0; index < previous.length; index++) {
        const key = indicatorCalculationKey(previous[index].definition, index);
        const compatible = previousByKey.get(key);
        if (compatible) compatible.push(previous[index]);
        else previousByKey.set(key, [previous[index]]);
      }
    }

    this.replaceItems(
      this.definitions.map((definition, index) => {
        const key = indicatorCalculationKey(definition, index);
        const existing = previousByKey.get(key)?.pop();
        if (existing) {
          existing.definition = definition;
          return existing;
        }
        if (this.data.isRingBuffer()) {
          return this.buildRingRuntime(definition);
        }
        return createIndicatorRuntime(definition, computeStockIndicator(staticData!, definition));
      }),
    );
    this.data.onChange();
  }

  append(physicalIndex: number, overwritten: RawCandleValues | null): void {
    for (const runtime of this.items) {
      this.processValue(runtime, physicalIndex, overwritten);
    }
  }

  rebaseRollingStates(latestPhysicalIndex: number): void {
    const capacity = this.data.getRingCapacity();
    const writeIndex = this.data.getWriteIndex();
    for (const runtime of this.items) {
      const definition = runtime.definition;
      if (definition.type !== "sma" && definition.type !== "bollinger") {
        continue;
      }

      const windowSize = Math.min(definition.period, capacity);
      const startIndex = (writeIndex - windowSize + capacity) % capacity;
      runtime.rollingMean = 0;
      runtime.rollingM2 = 0;
      runtime.rollingFiniteCount = 0;
      runtime.rollingInvalid = 0;
      for (let offset = 0; offset < windowSize; offset++) {
        const physicalIndex = (startIndex + offset) % capacity;
        const value = this.data.getSourceAtPhysical(definition.source, physicalIndex);
        if (Number.isFinite(value)) {
          addRollingValue(runtime, value);
        } else {
          runtime.rollingInvalid++;
        }
      }
      runtime.rollingCount = windowSize;
      this.writeRollingValue(runtime, latestPhysicalIndex);
    }
  }

  private replaceItems(next: IndicatorRuntime[]): void {
    this.items.splice(0, this.items.length, ...next);
  }

  private buildRingRuntime(definition: StockIndicator): IndicatorRuntime {
    const runtime = createIndicatorRuntime(
      definition,
      createEmptyComputedIndicator(definition, this.data.getRingCapacity()),
    );
    for (let logicalIndex = 0; logicalIndex < this.data.getDataLength(); logicalIndex++) {
      this.processValue(runtime, this.data.logicalToPhysicalIndex(logicalIndex), null);
    }
    return runtime;
  }

  private updateRollingState(
    runtime: IndicatorRuntime,
    physicalIndex: number,
    overwritten: RawCandleValues | null,
  ): void {
    const definition = runtime.definition;
    if (definition.type !== "sma" && definition.type !== "bollinger") {
      return;
    }

    const capacity = this.data.getRingCapacity();
    const windowSize = Math.min(definition.period, capacity);
    let shouldRebase = false;
    if (runtime.rollingCount >= windowSize) {
      const removedIndex = (physicalIndex - windowSize + capacity) % capacity;
      const removed =
        removedIndex === physicalIndex && overwritten
          ? getSourceFromCandle(definition.source, overwritten)
          : this.data.getSourceAtPhysical(definition.source, removedIndex);
      if (Number.isFinite(removed)) {
        shouldRebase = removeRollingValue(runtime, removed);
      } else {
        runtime.rollingInvalid--;
      }
    } else {
      runtime.rollingCount = Math.min(windowSize, runtime.rollingCount + 1);
    }

    const value = this.data.getSourceAtPhysical(definition.source, physicalIndex);
    if (Number.isFinite(value)) {
      addRollingValue(runtime, value);
    } else {
      runtime.rollingInvalid++;
    }

    if (shouldRebase) {
      this.rebaseRollingRuntime(runtime, physicalIndex, windowSize);
    }
  }

  private rebaseRollingRuntime(
    runtime: IndicatorRuntime,
    latestPhysicalIndex: number,
    windowSize: number,
  ): void {
    const capacity = this.data.getRingCapacity();
    const definition = runtime.definition;
    runtime.rollingMean = 0;
    runtime.rollingM2 = 0;
    runtime.rollingFiniteCount = 0;
    runtime.rollingInvalid = 0;
    for (let offset = windowSize - 1; offset >= 0; offset--) {
      const physicalIndex = (latestPhysicalIndex - offset + capacity) % capacity;
      const value = this.data.getSourceAtPhysical(definition.source, physicalIndex);
      if (Number.isFinite(value)) addRollingValue(runtime, value);
      else runtime.rollingInvalid++;
    }
  }

  private writeRollingValue(runtime: IndicatorRuntime, physicalIndex: number): void {
    const definition = runtime.definition;
    if (definition.type !== "sma" && definition.type !== "bollinger") {
      return;
    }

    const ready =
      definition.period <= this.data.getRingCapacity() &&
      runtime.rollingCount >= definition.period &&
      runtime.rollingInvalid === 0;
    const mean = ready ? runtime.rollingMean : Number.NaN;
    if (definition.type === "sma") {
      getIndicatorLine(runtime, "sma")![physicalIndex] = mean;
      return;
    }

    const middle = getIndicatorLine(runtime, "middle")!;
    const upper = getIndicatorLine(runtime, "upper")!;
    const lower = getIndicatorLine(runtime, "lower")!;
    if (!ready) {
      middle[physicalIndex] = Number.NaN;
      upper[physicalIndex] = Number.NaN;
      lower[physicalIndex] = Number.NaN;
      return;
    }
    const variance = Math.max(0, runtime.rollingM2 / definition.period);
    const width = Math.sqrt(variance) * (definition.deviation ?? 2);
    middle[physicalIndex] = mean;
    upper[physicalIndex] = mean + width;
    lower[physicalIndex] = mean - width;
  }

  private processValue(
    runtime: IndicatorRuntime,
    physicalIndex: number,
    overwritten: RawCandleValues | null,
  ): void {
    const definition = runtime.definition;
    if (definition.type === "sma" || definition.type === "bollinger") {
      this.updateRollingState(runtime, physicalIndex, overwritten);
      this.writeRollingValue(runtime, physicalIndex);
      return;
    }

    if (definition.type === "ema") {
      const line = getIndicatorLine(runtime, "ema")!;
      const value = this.data.getSourceAtPhysical(definition.source, physicalIndex);
      if (!Number.isFinite(value)) {
        runtime.emaValue = Number.NaN;
        runtime.emaSeedSum = 0;
        runtime.emaConsecutive = 0;
        line[physicalIndex] = Number.NaN;
        return;
      }
      if (runtime.emaConsecutive < definition.period) {
        runtime.emaSeedSum += value;
        runtime.emaConsecutive++;
        if (runtime.emaConsecutive === definition.period) {
          runtime.emaValue = runtime.emaSeedSum / definition.period;
          line[physicalIndex] = runtime.emaValue;
        } else {
          line[physicalIndex] = Number.NaN;
        }
        return;
      }
      const alpha = 2 / (definition.period + 1);
      runtime.emaValue += alpha * (value - runtime.emaValue);
      line[physicalIndex] = runtime.emaValue;
      return;
    }

    const line = getIndicatorLine(runtime, "vwap")!;
    const timestamp = this.data.getTimestampAtPhysical(physicalIndex);
    const price = this.data.getSourceAtPhysical(definition.source ?? "hlc3", physicalIndex);
    const volume = this.data.getVolumeAtPhysical(physicalIndex);
    if (!Number.isFinite(timestamp)) {
      runtime.vwapBucket = undefined;
      runtime.vwapPriceVolume = 0;
      runtime.vwapVolume = 0;
      line[physicalIndex] = Number.NaN;
      return;
    }
    const bucket = getVWAPBucketForDefinition(timestamp, definition);
    if (runtime.vwapBucket === undefined || runtime.vwapBucket !== bucket) {
      runtime.vwapBucket = bucket;
      runtime.vwapPriceVolume = 0;
      runtime.vwapVolume = 0;
    }
    if (!Number.isFinite(price) || !Number.isFinite(volume) || volume < 0) {
      runtime.vwapPriceVolume = 0;
      runtime.vwapVolume = 0;
      line[physicalIndex] = Number.NaN;
      return;
    }
    runtime.vwapPriceVolume += price * volume;
    runtime.vwapVolume += volume;
    line[physicalIndex] =
      runtime.vwapVolume > 0 ? runtime.vwapPriceVolume / runtime.vwapVolume : Number.NaN;
  }
}
