// OHLCV data types and CSV loader

export interface OHLCVData {
  /** Unix timestamps (ms). Ascending and descending input are accepted. */
  timestamp: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
  length: number;
}

/**
 * Validate aligned OHLCV columns and normalize reverse-chronological input.
 * Ascending data keeps its original typed arrays so worker transfers remain
 * zero-copy. Descending data is copied and reversed without mutating callers.
 */
export function normalizeOHLCVData(data: OHLCVData): OHLCVData {
  const length = data.timestamp.length;
  const columns = [data.open, data.high, data.low, data.close, data.volume];
  if (columns.some((column) => column.length !== length)) {
    throw new RangeError("OHLCV columns must all have the same length");
  }

  let direction: -1 | 0 | 1 = 0;
  for (let i = 0; i < length; i++) {
    const timestamp = data.timestamp[i];
    if (!Number.isFinite(timestamp)) {
      throw new TypeError("OHLCV timestamps must contain only finite values");
    }
    if (i === 0 || timestamp === data.timestamp[i - 1]) continue;

    const nextDirection = timestamp > data.timestamp[i - 1] ? 1 : -1;
    if (direction !== 0 && direction !== nextDirection) {
      throw new RangeError("OHLCV timestamps must be sorted in ascending or descending order");
    }
    direction = nextDirection;
  }

  if (direction !== -1) {
    return data.length === length ? data : { ...data, length };
  }

  return {
    timestamp: data.timestamp.slice().reverse(),
    open: data.open.slice().reverse(),
    high: data.high.slice().reverse(),
    low: data.low.slice().reverse(),
    close: data.close.slice().reverse(),
    volume: data.volume.slice().reverse(),
    length,
  };
}

function isHeaderLine(line: string): boolean {
  const firstCell = (line.split(",", 1)[0] ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();
  return (
    firstCell === "t" ||
    firstCell === "time" ||
    firstCell === "timestamp" ||
    firstCell === "date" ||
    firstCell === "datetime"
  );
}

/**
 * Load OHLCV data from a CSV file.
 *
 * @throws Error when the request returns a non-successful HTTP status.
 */
export async function loadOHLCVFromCSV(
  url: string,
  onProgress?: (progress: number) => void,
): Promise<OHLCVData> {
  const response = await fetch(url);
  if (response.ok === false) {
    throw new Error(`OHLCV request failed (${response.status}): ${url}`);
  }
  const text = await response.text();

  const trimmed = text.trim();
  if (!trimmed) {
    onProgress?.(1);
    return {
      timestamp: new Float64Array(0),
      open: new Float64Array(0),
      high: new Float64Array(0),
      low: new Float64Array(0),
      close: new Float64Array(0),
      volume: new Float64Array(0),
      length: 0,
    };
  }

  const lines = trimmed.split("\n");
  const hasHeader = isHeaderLine(lines[0]);
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const length = dataLines.length;

  const timestamp = new Float64Array(length);
  const open = new Float64Array(length);
  const high = new Float64Array(length);
  const low = new Float64Array(length);
  const close = new Float64Array(length);
  const volume = new Float64Array(length);

  const chunkSize = 50000;
  let processed = 0;

  while (processed < length) {
    const end = Math.min(processed + chunkSize, length);

    for (let i = processed; i < end; i++) {
      const parts = dataLines[i].split(",");
      timestamp[i] = parseFloat(parts[0]);
      open[i] = parseFloat(parts[1]);
      high[i] = parseFloat(parts[2]);
      low[i] = parseFloat(parts[3]);
      close[i] = parseFloat(parts[4]);
      volume[i] = parseFloat(parts[5]) || 0;
    }

    processed = end;
    onProgress?.(processed / length);

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return normalizeOHLCVData({ timestamp, open, high, low, close, volume, length });
}

/** Generate synthetic OHLCV data for tests and demonstrations. */
export async function generateOHLCVData(
  pointCount: number,
  intervalMs: number = 3600000, // 1 hour default
  onProgress?: (progress: number) => void,
): Promise<OHLCVData> {
  const timestamp = new Float64Array(pointCount);
  const open = new Float64Array(pointCount);
  const high = new Float64Array(pointCount);
  const low = new Float64Array(pointCount);
  const close = new Float64Array(pointCount);
  const volume = new Float64Array(pointCount);

  const startTimestamp = 1262304000000; // Jan 1, 2010

  let price = 100;
  const volatility = 0.02;

  const gaussianRandom = () => {
    const u1 = Math.random() || Number.MIN_VALUE;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const chunkSize = 100000;
  let processed = 0;

  while (processed < pointCount) {
    const end = Math.min(processed + chunkSize, pointCount);

    for (let i = processed; i < end; i++) {
      timestamp[i] = startTimestamp + i * intervalMs;

      const o = price;
      const change1 = volatility * gaussianRandom();
      const change2 = volatility * gaussianRandom();
      const change3 = volatility * gaussianRandom();

      const c = o * (1 + change1);
      const h = Math.max(o, c) * (1 + Math.abs(change2) * 0.5);
      const l = Math.min(o, c) * (1 - Math.abs(change3) * 0.5);

      open[i] = o;
      high[i] = h;
      low[i] = l;
      close[i] = c;
      volume[i] = Math.floor(1000000 + Math.random() * 5000000);

      price = c;
      price = Math.max(1, Math.min(100000, price));
    }

    processed = end;
    onProgress?.(processed / pointCount);

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { timestamp, open, high, low, close, volume, length: pointCount };
}
