import {
  formatValue,
  type TooltipContent,
  type UnitOptions,
} from "@sixtyfold/core/internal/renderer";
import { formatRangeValue } from "./lineMath.js";

export interface DataPointResult {
  x: number;
  y: number;
  idx: number;
  interpolatedY?: number;
  stackedY?: number;
  interpolatedStackedY?: number;
  low?: number;
  high?: number;
  interpolatedLow?: number;
  interpolatedHigh?: number;
  isInterpolated: boolean;
}

export interface RangeDisplayValues {
  low: number;
  high: number;
}

export function getDisplayY(point: DataPointResult): number {
  return point.isInterpolated && point.interpolatedY !== undefined ? point.interpolatedY : point.y;
}

export function getMarkerY(point: DataPointResult): number {
  if (point.isInterpolated && point.interpolatedStackedY !== undefined) {
    return point.interpolatedStackedY;
  }
  return point.stackedY ?? getDisplayY(point);
}

export function getDisplayRange(point: DataPointResult): RangeDisplayValues | null {
  const low =
    point.isInterpolated && point.interpolatedLow !== undefined ? point.interpolatedLow : point.low;
  const high =
    point.isInterpolated && point.interpolatedHigh !== undefined
      ? point.interpolatedHigh
      : point.high;
  if (low === undefined || high === undefined || !Number.isFinite(low) || !Number.isFinite(high)) {
    return null;
  }
  return low <= high ? { low, high } : { low: high, high: low };
}

export interface LineTooltipContentOptions {
  title: string;
  points: readonly (DataPointResult | null)[];
  seriesCount: number;
  visibleSeries?: readonly number[] | null;
  isSeriesVisible(index: number): boolean;
  getSeriesUnit(index: number): UnitOptions | undefined;
  getSeriesName(index: number): string;
  getSeriesColor(index: number): string;
}

export function buildLineTooltipContent(options: LineTooltipContentOptions): TooltipContent {
  const rows: TooltipContent["rows"] = [];
  const indices =
    options.visibleSeries ?? Array.from({ length: options.seriesCount }, (_, index) => index);
  for (const seriesIndex of indices) {
    if (seriesIndex < 0 || seriesIndex >= options.seriesCount) continue;
    if (!options.isSeriesVisible(seriesIndex)) continue;
    const point = options.points[seriesIndex];
    if (!point) continue;

    const displayY = getDisplayY(point);
    const range = getDisplayRange(point);
    const unit = options.getSeriesUnit(seriesIndex);
    rows.push({
      label: options.getSeriesName(seriesIndex),
      value: range ? formatRangeValue(range.low, range.high, unit) : formatValue(displayY, unit),
      color: options.getSeriesColor(seriesIndex),
      dimmed: false,
    });
  }

  return { visible: true, title: options.title, rows };
}
