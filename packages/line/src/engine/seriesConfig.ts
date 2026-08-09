import type { UnitOptions } from "@sixtyfold/core/internal/renderer";
import type { LineDashStyle, LineSeriesType, StackCurveStyle } from "./lineOptions.js";

export interface SeriesGradient {
  /** Invalid CSS color stops are skipped. */
  colors: string[];
  direction?: "vertical" | "horizontal";
  offsets?: number[];
}

export interface MarkerGlowOptions {
  color?: string;
  blur?: number;
  opacity?: number;
}

export interface MarkerOptions {
  shape?: string;
  size?: number;
  borderColor?: string;
  borderWidth?: number;
  glow?: boolean | MarkerGlowOptions;
}

export interface ResolvedMarkerGlowOptions {
  enabled: boolean;
  color?: string;
  blur: number;
  opacity: number;
}

export interface ResolvedMarkerOptions {
  shape: string;
  size: number;
  borderColor: string;
  borderWidth: number;
  glow: ResolvedMarkerGlowOptions;
}

export interface BarOptions {
  fill?: boolean | number;
  fillColor?: string | SeriesGradient;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: LineDashStyle;
  widthRatio?: number;
  minWidth?: number;
  maxWidth?: number;
  baseline?: number;
}

export interface StackOptions {
  fill?: boolean | number;
  fillColor?: string | SeriesGradient;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: LineDashStyle;
  curve?: StackCurveStyle;
}

export interface PointOptions {
  shape?: string;
  size?: number;
  color?: string;
  opacity?: number;
  borderColor?: string;
  borderWidth?: number;
}

export interface BandOptions {
  fill?: boolean | number;
  fillColor?: string | SeriesGradient;
  borderColor?: string;
  upperBorderColor?: string;
  lowerBorderColor?: string;
  borderWidth?: number;
  borderStyle?: LineDashStyle;
}

export interface SeriesOptions {
  name?: string;
  type?: LineSeriesType;
  color?: string;
  fill?: boolean | number;
  fillColor?: string | SeriesGradient;
  fillToZero?: boolean;
  fillEffect?: "none" | "glow" | "layered";
  band?: BandOptions;
  bar?: BarOptions;
  stack?: StackOptions;
  point?: PointOptions;
  width?: number;
  unit?: UnitOptions;
  marker?: MarkerOptions;
}

export interface ResolvedPointOptions {
  shape: string;
  size: number;
  color: string;
  opacity: number;
  borderColor: string;
  borderWidth: number;
}

export interface SeriesConfigState {
  options: SeriesOptions[];
  chartMarker: MarkerOptions;
  visibility: boolean[];
  count: number;
  resolvedMarkerCache: Array<ResolvedMarkerOptions | undefined>;
}

const DEFAULT_MARKER_GLOW_BLUR = 12;
const DEFAULT_MARKER_GLOW_OPACITY = 0.45;

const DEFAULT_COLORS = [
  "#ec4899",
  "#f97316",
  "#3b82f6",
  "#ef4444",
  "#a855f7",
  "#22c55e",
  "#84cc16",
  "#06b6d4",
  "#eab308",
  "#8b5cf6",
];

export function createSeriesConfigState(): SeriesConfigState {
  return {
    options: [],
    chartMarker: {},
    visibility: [],
    count: 0,
    resolvedMarkerCache: [],
  };
}

export function resetMarkerCache(config: SeriesConfigState): void {
  config.resolvedMarkerCache.length = 0;
}

export function getSeriesColor(config: SeriesConfigState, index: number): string {
  const options = config.options[index];
  if (options?.color) return options.color;
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

export function getSeriesType(config: SeriesConfigState, index: number): LineSeriesType {
  const seriesType = config.options[index]?.type;
  switch (seriesType) {
    case "step":
    case "step-before":
    case "step-after":
    case "step-mid":
    case "range":
    case "band":
    case "scatter":
    case "points":
    case "bar":
    case "column":
    case "stacked-area":
    case "stackedArea":
      return seriesType;
    default:
      return "line";
  }
}

export function getBarBaselineForBounds(config: SeriesConfigState, index: number): number | null {
  const seriesType = getSeriesType(config, index);
  if (seriesType !== "bar" && seriesType !== "column") return null;
  const baseline = config.options[index]?.bar?.baseline;
  return Number.isFinite(baseline) ? baseline! : 0;
}

export function resolveSeriesPointOptions(
  config: SeriesConfigState,
  index: number,
): ResolvedPointOptions {
  const point = config.options[index]?.point;
  const size = point?.size;
  const opacity = point?.opacity;
  const borderWidth = point?.borderWidth;
  return {
    shape: point?.shape ?? "circle",
    size: Number.isFinite(size) && size! > 0 ? size! : 3,
    color: point?.color ?? getSeriesColor(config, index),
    opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity!)) : 1,
    borderColor: point?.borderColor ?? "#fff",
    borderWidth: Number.isFinite(borderWidth) && borderWidth! >= 0 ? borderWidth! : 0,
  };
}

export function getSeriesUnit(config: SeriesConfigState, index: number): UnitOptions | undefined {
  return config.options[index]?.unit;
}

function createDefaultMarkerGlow(): ResolvedMarkerGlowOptions {
  return {
    enabled: false,
    color: undefined,
    blur: DEFAULT_MARKER_GLOW_BLUR,
    opacity: DEFAULT_MARKER_GLOW_OPACITY,
  };
}

function applyMarkerGlowSetting(
  target: ResolvedMarkerGlowOptions,
  setting: boolean | MarkerGlowOptions | undefined,
): void {
  if (setting === undefined) return;
  if (setting === false) {
    target.enabled = false;
    return;
  }
  if (setting === true) {
    target.enabled = true;
    return;
  }

  target.enabled = true;
  if (setting.color !== undefined) target.color = setting.color;
  if (setting.blur !== undefined) {
    target.blur =
      Number.isFinite(setting.blur) && setting.blur >= 0 ? setting.blur : DEFAULT_MARKER_GLOW_BLUR;
  }
  if (setting.opacity !== undefined) {
    target.opacity = Number.isFinite(setting.opacity)
      ? Math.max(0, Math.min(1, setting.opacity))
      : DEFAULT_MARKER_GLOW_OPACITY;
  }
}

function resolveMarkerGlow(config: SeriesConfigState, index: number): ResolvedMarkerGlowOptions {
  const resolved = createDefaultMarkerGlow();
  applyMarkerGlowSetting(resolved, config.chartMarker.glow);
  applyMarkerGlowSetting(resolved, config.options[index]?.marker?.glow);
  return resolved;
}

export function resolveSeriesMarker(
  config: SeriesConfigState,
  index: number,
): ResolvedMarkerOptions {
  const cached = config.resolvedMarkerCache[index];
  if (cached) return cached;

  const marker = config.options[index]?.marker;
  const rawSize = marker?.size ?? config.chartMarker.size ?? 5;
  const rawBorderWidth = marker?.borderWidth ?? config.chartMarker.borderWidth ?? 1;
  const resolved: ResolvedMarkerOptions = {
    shape: marker?.shape ?? config.chartMarker.shape ?? "circle",
    size: Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 5,
    borderColor: marker?.borderColor ?? config.chartMarker.borderColor ?? "#fff",
    borderWidth: Number.isFinite(rawBorderWidth) && rawBorderWidth >= 0 ? rawBorderWidth : 1,
    glow: resolveMarkerGlow(config, index),
  };
  config.resolvedMarkerCache[index] = resolved;
  return resolved;
}

export function getSeriesMarker(config: SeriesConfigState, index: number): ResolvedMarkerOptions {
  const marker = resolveSeriesMarker(config, index);
  return { ...marker, glow: { ...marker.glow } };
}

export function getSeriesName(config: SeriesConfigState, index: number): string {
  const named = config.options[index]?.name;
  if (named !== undefined) return named;
  return getSeriesUnit(config, index)?.name ?? String(index + 1);
}

export function isSeriesVisible(config: SeriesConfigState, index: number): boolean {
  return config.visibility[index] !== false;
}

export function ensureSeriesVisibility(config: SeriesConfigState, count: number): boolean {
  const previous = config.visibility;
  const next = new Array<boolean>(count);
  for (let index = 0; index < count; index++) {
    next[index] = previous[index] ?? true;
  }
  config.visibility = next;
  if (previous.length !== next.length) return true;
  for (let index = 0; index < next.length; index++) {
    if (previous[index] !== next[index]) return true;
  }
  return false;
}

export function getVisibleSeriesCount(config: SeriesConfigState): number {
  let count = 0;
  for (let index = 0; index < config.count; index++) {
    if (isSeriesVisible(config, index)) count++;
  }
  return count;
}

export function getSeriesLineWidth(
  config: SeriesConfigState,
  index: number,
  fallback = 1.5,
): number {
  const width = config.options[index]?.width;
  if (width === 0) return 0;
  return typeof width === "number" && Number.isFinite(width) && width > 0 ? width : fallback;
}
