import { type AggregatedLevel, StockLevelAccess } from "./levels.js";

const MINUTE = 60_000;
const HOUR = MINUTE * 60;

export interface AggregationLevelDefinition {
  name: string;
  interval: number;
}

export const STOCK_AGGREGATION_LEVELS: readonly AggregationLevelDefinition[] = [
  { name: "1m", interval: MINUTE },
  { name: "5m", interval: MINUTE * 5 },
  { name: "15m", interval: MINUTE * 15 },
  { name: "1H", interval: HOUR },
  { name: "4H", interval: HOUR * 4 },
  { name: "1D", interval: HOUR * 24 },
  { name: "1W", interval: HOUR * 24 * 7 },
  { name: "1M", interval: HOUR * 24 * 30 },
];

export function formatAggregationInterval(interval: number): string {
  if (!Number.isFinite(interval) || interval <= 0) return "RAW";
  if (interval < MINUTE && interval % 1_000 === 0) {
    return `${interval / 1_000}s`;
  }
  if (interval < HOUR && interval % MINUTE === 0) {
    return `${interval / MINUTE}m`;
  }
  if (interval < HOUR * 24 && interval % HOUR === 0) {
    return `${interval / HOUR}H`;
  }
  if (interval % (HOUR * 24) === 0) {
    return `${interval / (HOUR * 24)}D`;
  }
  return "RAW";
}

export function firstAggregationLevelIndex(
  levels: readonly AggregationLevelDefinition[],
  rawInterval: number,
): number {
  let index = 0;
  while (index < levels.length && levels[index].interval <= rawInterval) {
    index++;
  }
  return index;
}

function emptyLevel(definition: AggregationLevelDefinition): AggregatedLevel {
  return {
    name: definition.name,
    interval: definition.interval,
    timestamp: new Float64Array(0),
    open: new Float64Array(0),
    high: new Float64Array(0),
    low: new Float64Array(0),
    close: new Float64Array(0),
    volume: new Float64Array(0),
    length: 0,
  };
}

export function aggregateLevel(
  source: AggregatedLevel,
  definition: AggregationLevelDefinition,
  access: StockLevelAccess,
  marketTime: boolean,
): AggregatedLevel {
  if (source.length === 0) return emptyLevel(definition);

  const interval = definition.interval;
  const firstTimestamp = access.getTimestamp(source, 0);
  const lastTimestamp = access.getTimestamp(source, source.length - 1);
  const timeRange = lastTimestamp - firstTimestamp;
  const estimatedByTime =
    Number.isFinite(timeRange) && timeRange >= 0
      ? Math.ceil(timeRange / interval) + 1
      : source.length;
  const initialCapacity = Math.max(
    1,
    Math.min(source.length, Number.isFinite(estimatedByTime) ? estimatedByTime : source.length),
  );

  let timestamp = new Float64Array(initialCapacity);
  let open = new Float64Array(initialCapacity);
  let high = new Float64Array(initialCapacity);
  let low = new Float64Array(initialCapacity);
  let close = new Float64Array(initialCapacity);
  let volume = new Float64Array(initialCapacity);
  let sourceEndTimestamp = new Float64Array(initialCapacity);
  let marketX = marketTime ? new Float64Array(initialCapacity) : undefined;
  let outputIndex = 0;

  const ensureOutputCapacity = (): boolean => {
    if (outputIndex < timestamp.length) return true;

    const nextCapacity = Math.min(source.length, Math.max(outputIndex + 1, timestamp.length * 2));
    if (nextCapacity <= timestamp.length) return false;

    const nextTimestamp = new Float64Array(nextCapacity);
    const nextOpen = new Float64Array(nextCapacity);
    const nextHigh = new Float64Array(nextCapacity);
    const nextLow = new Float64Array(nextCapacity);
    const nextClose = new Float64Array(nextCapacity);
    const nextVolume = new Float64Array(nextCapacity);
    const nextSourceEndTimestamp = new Float64Array(nextCapacity);
    const nextMarketX = marketX ? new Float64Array(nextCapacity) : undefined;
    nextTimestamp.set(timestamp);
    nextOpen.set(open);
    nextHigh.set(high);
    nextLow.set(low);
    nextClose.set(close);
    nextVolume.set(volume);
    nextSourceEndTimestamp.set(sourceEndTimestamp);
    if (nextMarketX && marketX) nextMarketX.set(marketX);
    timestamp = nextTimestamp;
    open = nextOpen;
    high = nextHigh;
    low = nextLow;
    close = nextClose;
    volume = nextVolume;
    sourceEndTimestamp = nextSourceEndTimestamp;
    marketX = nextMarketX;
    return true;
  };

  let startIndex = 0;
  for (; startIndex < source.length; startIndex++) {
    if (
      Number.isFinite(access.getTimestamp(source, startIndex)) &&
      Number.isFinite(access.getOpen(source, startIndex)) &&
      Number.isFinite(access.getHigh(source, startIndex)) &&
      Number.isFinite(access.getLow(source, startIndex)) &&
      Number.isFinite(access.getClose(source, startIndex))
    ) {
      break;
    }
  }
  if (startIndex >= source.length) return emptyLevel(definition);

  let bucketStart = Math.floor(access.getTimestamp(source, startIndex) / interval) * interval;
  let bucketOpen = access.getOpen(source, startIndex);
  let bucketHigh = access.getHigh(source, startIndex);
  let bucketLow = access.getLow(source, startIndex);
  let bucketClose = access.getClose(source, startIndex);
  let bucketVolume = access.getVolume(source, startIndex) || 0;
  let bucketEndTimestamp = access.getTimestamp(source, startIndex);
  let bucketMarketStart = access.getX(source, startIndex);
  let bucketMarketEnd = bucketMarketStart;
  let hasValidData = true;

  const writeBucket = (): void => {
    if (!hasValidData || !Number.isFinite(bucketOpen) || !ensureOutputCapacity()) {
      return;
    }
    timestamp[outputIndex] = bucketStart;
    open[outputIndex] = bucketOpen;
    high[outputIndex] = bucketHigh;
    low[outputIndex] = bucketLow;
    close[outputIndex] = bucketClose;
    volume[outputIndex] = bucketVolume;
    sourceEndTimestamp[outputIndex] = bucketEndTimestamp;
    if (marketX) {
      marketX[outputIndex] = (bucketMarketStart + bucketMarketEnd) / 2;
    }
    outputIndex++;
  };

  for (let index = startIndex + 1; index < source.length; index++) {
    const currentTimestamp = access.getTimestamp(source, index);
    if (!Number.isFinite(currentTimestamp)) continue;
    const currentBucket = Math.floor(currentTimestamp / interval) * interval;
    const currentOpen = access.getOpen(source, index);
    const currentHigh = access.getHigh(source, index);
    const currentLow = access.getLow(source, index);
    const currentClose = access.getClose(source, index);
    const currentVolume = access.getVolume(source, index);
    const isValid =
      Number.isFinite(currentOpen) &&
      Number.isFinite(currentHigh) &&
      Number.isFinite(currentLow) &&
      Number.isFinite(currentClose);

    if (currentBucket !== bucketStart) {
      writeBucket();
      bucketStart = currentBucket;
      bucketMarketStart = access.getX(source, index);
      bucketMarketEnd = bucketMarketStart;
      if (isValid) {
        bucketOpen = currentOpen;
        bucketHigh = currentHigh;
        bucketLow = currentLow;
        bucketClose = currentClose;
        bucketVolume = currentVolume || 0;
        bucketEndTimestamp = currentTimestamp;
        hasValidData = true;
      } else {
        bucketOpen = Number.NaN;
        bucketHigh = -Infinity;
        bucketLow = Infinity;
        bucketClose = Number.NaN;
        bucketVolume = 0;
        hasValidData = false;
      }
    } else if (isValid) {
      if (!hasValidData) {
        bucketOpen = currentOpen;
        hasValidData = true;
      }
      if (currentHigh > bucketHigh) bucketHigh = currentHigh;
      if (currentLow < bucketLow) bucketLow = currentLow;
      bucketClose = currentClose;
      bucketVolume += currentVolume || 0;
      bucketEndTimestamp = currentTimestamp;
      bucketMarketEnd = access.getX(source, index);
    }
  }

  writeBucket();
  return {
    name: definition.name,
    interval: definition.interval,
    timestamp: timestamp.subarray(0, outputIndex),
    open: open.subarray(0, outputIndex),
    high: high.subarray(0, outputIndex),
    low: low.subarray(0, outputIndex),
    close: close.subarray(0, outputIndex),
    volume: volume.subarray(0, outputIndex),
    sourceEndTimestamp: sourceEndTimestamp.subarray(0, outputIndex),
    ...(marketX ? { marketX: marketX.subarray(0, outputIndex) } : {}),
    length: outputIndex,
  };
}
