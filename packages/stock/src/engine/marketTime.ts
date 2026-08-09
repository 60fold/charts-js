const DAY_MS = 24 * 60 * 60 * 1000;
const MARKET_RANGE_SESSION_COUNTS: Readonly<Record<string, number>> = {
  "1D": 1,
  "5D": 5,
  "1M": 21,
  "3M": 63,
  "6M": 126,
  "1Y": 252,
  "5Y": 1_260,
};

export interface MarketCoordinateBuildOptions {
  length: number;
  capacity: number;
  rawInterval: number;
  gapCap: number;
  existing: Float64Array | null;
  logicalToPhysicalIndex(index: number): number;
  getTimestamp(index: number): number;
}

export interface MarketCoordinateBuildResult {
  coordinates: Float64Array;
  dayStarts: number[];
}

export function inferMinimumInterval(
  length: number,
  getTimestamp: (index: number) => number,
): number | null {
  if (length < 2) return null;
  let minimum = Infinity;
  let previous = getTimestamp(0);
  for (let index = 1; index < length; index++) {
    const timestamp = getTimestamp(index);
    const difference = timestamp - previous;
    if (Number.isFinite(difference) && difference > 0 && difference < minimum) {
      minimum = difference;
    }
    previous = timestamp;
  }
  return Number.isFinite(minimum) ? minimum : null;
}

export function nextMinimumInterval(
  current: number,
  known: boolean,
  previousTimestamp: number,
  timestamp: number,
): { interval: number; known: boolean } {
  const difference = timestamp - previousTimestamp;
  if (!Number.isFinite(difference) || difference <= 0) {
    return { interval: current, known };
  }
  if (!known || difference < current) {
    return { interval: difference, known: true };
  }
  return { interval: current, known };
}

export function buildMarketCoordinates(
  options: MarketCoordinateBuildOptions,
): MarketCoordinateBuildResult {
  const coordinates =
    options.existing && options.existing.length >= options.capacity
      ? options.existing
      : new Float64Array(options.capacity);
  const dayStarts: number[] = [];
  if (options.length === 0) {
    return { coordinates, dayStarts };
  }

  let previousTimestamp = options.getTimestamp(0);
  let previousDay = Math.floor(previousTimestamp / DAY_MS);
  coordinates[options.logicalToPhysicalIndex(0)] = 0;
  dayStarts.push(0);

  for (let index = 1; index < options.length; index++) {
    const timestamp = options.getTimestamp(index);
    const difference = timestamp - previousTimestamp;
    const previousPhysicalIndex = options.logicalToPhysicalIndex(index - 1);
    const physicalIndex = options.logicalToPhysicalIndex(index);
    coordinates[physicalIndex] =
      coordinates[previousPhysicalIndex] +
      (Number.isFinite(difference) && difference > 0
        ? Math.min(difference, options.gapCap)
        : options.rawInterval);
    const day = Math.floor(timestamp / DAY_MS);
    if (day !== previousDay) {
      dayStarts.push(index);
      previousDay = day;
    }
    previousTimestamp = timestamp;
  }
  return { coordinates, dayStarts };
}

export function collectMarketDayStarts(
  length: number,
  getTimestamp: (index: number) => number,
): number[] {
  const dayStarts: number[] = [];
  let previousDay = Number.NaN;
  for (let index = 0; index < length; index++) {
    const day = Math.floor(getTimestamp(index) / DAY_MS);
    if (day !== previousDay) {
      dayStarts.push(index);
      previousDay = day;
    }
  }
  return dayStarts;
}

function lowerBound(length: number, target: number, getValue: (index: number) => number): number {
  let low = 0;
  let high = Math.max(0, length - 1);
  while (low < high) {
    const middle = (low + high) >> 1;
    if (getValue(middle) < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function timestampToMarketX(
  timestamp: number,
  length: number,
  getTimestamp: (index: number) => number,
  getMarketX: (index: number) => number,
): number {
  if (length === 0) return timestamp;
  let index = lowerBound(length, timestamp, getTimestamp);
  if (index <= 0) return getMarketX(0);
  if (index >= length) index = length - 1;
  const currentTimestamp = getTimestamp(index);
  const previousTimestamp = getTimestamp(index - 1);
  const currentX = getMarketX(index);
  const previousX = getMarketX(index - 1);
  if (currentTimestamp <= previousTimestamp) return currentX;
  const ratio = Math.max(
    0,
    Math.min(1, (timestamp - previousTimestamp) / (currentTimestamp - previousTimestamp)),
  );
  return previousX + (currentX - previousX) * ratio;
}

export function marketXToTimestamp(
  marketX: number,
  length: number,
  getTimestamp: (index: number) => number,
  getMarketX: (index: number) => number,
): number {
  if (length === 0) return marketX;
  let index = lowerBound(length, marketX, getMarketX);
  if (index <= 0) return getTimestamp(0);
  if (index >= length) index = length - 1;
  const currentX = getMarketX(index);
  const previousX = getMarketX(index - 1);
  const currentTimestamp = getTimestamp(index);
  const previousTimestamp = getTimestamp(index - 1);
  if (currentX <= previousX) return currentTimestamp;
  const ratio = Math.max(0, Math.min(1, (marketX - previousX) / (currentX - previousX)));
  return previousTimestamp + (currentTimestamp - previousTimestamp) * ratio;
}

export function getSessionStartIndex(dayStarts: readonly number[], requestedDays: number): number {
  const dayIndex = Math.max(0, dayStarts.length - requestedDays);
  return dayStarts[dayIndex] ?? 0;
}

export function getContinuousRangeStart(rangeType: string, now: number, dataMin: number): number {
  switch (rangeType) {
    case "1D":
      return now - DAY_MS;
    case "5D":
      return now - DAY_MS * 5;
    case "1M":
      return now - DAY_MS * 30;
    case "3M":
      return now - DAY_MS * 90;
    case "6M":
      return now - DAY_MS * 180;
    case "YTD": {
      const nowDate = new Date(now);
      return new Date(nowDate.getFullYear(), 0, 1).getTime();
    }
    case "1Y":
      return now - DAY_MS * 365;
    case "5Y":
      return now - DAY_MS * 365 * 5;
    case "ALL":
    default:
      return dataMin;
  }
}

export interface MarketRangeStartOptions {
  rangeType: string;
  dataMin: number;
  dayStarts: readonly number[];
  lastTimestamp: number;
  getRawMarketX(index: number): number;
  timestampToMarketX(timestamp: number): number;
}

export function getMarketRangeStart(options: MarketRangeStartOptions): number {
  if (options.rangeType === "YTD") {
    const lastDate = new Date(options.lastTimestamp);
    return options.timestampToMarketX(Date.UTC(lastDate.getUTCFullYear(), 0, 1));
  }
  const requestedDays = MARKET_RANGE_SESSION_COUNTS[options.rangeType];
  if (requestedDays !== undefined) {
    return options.getRawMarketX(getSessionStartIndex(options.dayStarts, requestedDays));
  }
  return options.dataMin;
}
