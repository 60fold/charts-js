import type { LineSeriesData, RangeSeriesData } from "@sixtyfold/core/data/seriesTypes";

export const DEFAULT_PUBLIC_PRESENTATION_COLUMNS_PER_CSS_PIXEL = 0.75;
export const MIN_PRESENTATION_COLUMNS_PER_CSS_PIXEL = 0.25;
export const MAX_PRESENTATION_COLUMNS_PER_CSS_PIXEL = 2;
export const DEFAULT_PRESENTATION_REBASE_RATIO = 1.25;
export const MIN_PRESENTATION_REBASE_RATIO = 1.05;
export const MAX_PRESENTATION_REBASE_RATIO = 2;
export const DEFAULT_PRESENTATION_QUANTIZATION_STEP = 0.25;
export const MIN_PRESENTATION_QUANTIZATION_STEP = 0.05;
export const MAX_PRESENTATION_QUANTIZATION_STEP = 1;

export type LineDashStyle = "solid" | "dashed" | "dotted";
export type LineSeriesType =
  | "line"
  | "range"
  | "band"
  | "scatter"
  | "points"
  | "bar"
  | "column"
  | "stacked-area"
  | "stackedArea"
  | "step"
  | "step-before"
  | "step-after"
  | "step-mid";
export type StackCurveStyle = "linear" | "step" | "step-before" | "step-after" | "step-mid";
export type LegendSwatchShape =
  "circle" | "square" | "diamond" | "triangle" | "cross" | "x" | "line";

export function resolvePresentationDensity(
  value: unknown,
  fallback = DEFAULT_PUBLIC_PRESENTATION_COLUMNS_PER_CSS_PIXEL,
): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.max(
        MIN_PRESENTATION_COLUMNS_PER_CSS_PIXEL,
        Math.min(MAX_PRESENTATION_COLUMNS_PER_CSS_PIXEL, value),
      )
    : fallback;
}

export function resolvePresentationRebaseRatio(
  value: unknown,
  fallback = DEFAULT_PRESENTATION_REBASE_RATIO,
): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.max(MIN_PRESENTATION_REBASE_RATIO, Math.min(MAX_PRESENTATION_REBASE_RATIO, value))
    : fallback;
}

export function resolvePresentationQuantizationStep(
  value: unknown,
  fallback = DEFAULT_PRESENTATION_QUANTIZATION_STEP,
): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.max(
        MIN_PRESENTATION_QUANTIZATION_STEP,
        Math.min(MAX_PRESENTATION_QUANTIZATION_STEP, value),
      )
    : fallback;
}

export function isScatterSeriesType(seriesType: LineSeriesType): boolean {
  return seriesType === "scatter" || seriesType === "points";
}

export function isBarSeriesType(seriesType: LineSeriesType): boolean {
  return seriesType === "bar" || seriesType === "column";
}

export function isStackedAreaSeriesType(seriesType: LineSeriesType): boolean {
  return seriesType === "stacked-area" || seriesType === "stackedArea";
}

export function isStepSeriesType(seriesType: LineSeriesType): boolean {
  return (
    seriesType === "step" ||
    seriesType === "step-before" ||
    seriesType === "step-after" ||
    seriesType === "step-mid"
  );
}

export function isDiscreteSeriesType(seriesType: LineSeriesType): boolean {
  return isScatterSeriesType(seriesType) || isBarSeriesType(seriesType);
}

export function parseLegendSwatchShape(shape: unknown): LegendSwatchShape | null {
  if (
    shape === "circle" ||
    shape === "square" ||
    shape === "diamond" ||
    shape === "triangle" ||
    shape === "cross" ||
    shape === "x" ||
    shape === "line"
  ) {
    return shape;
  }
  return null;
}

export function parseDashStyle(style: LineDashStyle | undefined): LineDashStyle {
  if (style === "dashed" || style === "dotted" || style === "solid") {
    return style;
  }
  return "solid";
}

export function parseStackCurveStyle(curve: StackCurveStyle | undefined): StackCurveStyle {
  switch (curve) {
    case "step":
    case "step-before":
    case "step-after":
    case "step-mid":
      return curve;
    default:
      return "linear";
  }
}

export function stackCurveToSeriesType(curve: StackCurveStyle): LineSeriesType {
  return curve === "linear" ? "line" : curve;
}

export function reverseStackCurve(curve: StackCurveStyle): StackCurveStyle {
  switch (curve) {
    case "step":
    case "step-after":
      return "step-before";
    case "step-before":
      return "step-after";
    default:
      return curve;
  }
}

export function isRangeSeriesInput(series: LineSeriesData): series is RangeSeriesData {
  return (
    !(series instanceof Float64Array) &&
    series !== null &&
    typeof series === "object" &&
    series.low instanceof Float64Array &&
    series.high instanceof Float64Array
  );
}
