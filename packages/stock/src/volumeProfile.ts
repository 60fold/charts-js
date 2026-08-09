/**
 * Add one candle's volume to price rows using a uniform low-to-high estimate.
 *
 * OHLCV candles do not contain trades-at-price, so no candle-derived profile
 * can reconstruct the exchange's exact distribution. Spreading volume across
 * the reported range avoids claiming that the entire candle traded at one
 * representative price while keeping the approximation deterministic.
 *
 * Returns the portion of the candle volume that overlaps the visible price
 * range.
 */
export function accumulateEstimatedCandleVolume(
  profile: Float64Array,
  low: number,
  high: number,
  volume: number,
  visibleLow: number,
  visibleHigh: number,
): number {
  const rows = profile.length;
  const visibleRange = visibleHigh - visibleLow;
  if (
    rows === 0 ||
    !Number.isFinite(low) ||
    !Number.isFinite(high) ||
    high < low ||
    !Number.isFinite(volume) ||
    volume <= 0 ||
    !Number.isFinite(visibleRange) ||
    visibleRange <= 0
  ) {
    return 0;
  }

  if (high === low) {
    if (low < visibleLow || low > visibleHigh) return 0;
    const normalized = (low - visibleLow) / visibleRange;
    const row = Math.max(0, Math.min(rows - 1, Math.floor(normalized * rows)));
    profile[row] += volume;
    return volume;
  }

  const clippedLow = Math.max(low, visibleLow);
  const clippedHigh = Math.min(high, visibleHigh);
  if (clippedHigh <= clippedLow) return 0;

  const rowHeight = visibleRange / rows;
  const firstRow = Math.max(
    0,
    Math.min(rows - 1, Math.floor((clippedLow - visibleLow) / rowHeight)),
  );
  const lastRow = Math.max(
    0,
    Math.min(rows - 1, Math.ceil((clippedHigh - visibleLow) / rowHeight) - 1),
  );
  const candleRange = high - low;
  let allocated = 0;

  for (let row = firstRow; row <= lastRow; row++) {
    const rowLow = visibleLow + row * rowHeight;
    const rowHigh = rowLow + rowHeight;
    const overlap = Math.max(0, Math.min(high, rowHigh) - Math.max(low, rowLow));
    if (overlap <= 0) continue;
    const rowVolume = volume * (overlap / candleRange);
    profile[row] += rowVolume;
    allocated += rowVolume;
  }

  return allocated;
}
