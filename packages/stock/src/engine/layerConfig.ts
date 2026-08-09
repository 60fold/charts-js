import type { StockMarker, StockPriceLine, VolumeProfileOptions } from "../marketLayers.js";

export interface ResolvedVolumeProfile {
  visible: boolean;
  rows: number;
  width: number;
  placement: "left" | "right";
  valueAreaPercent: number;
  opacity: number;
  upColor?: string;
  downColor?: string;
  pointOfControlColor: string;
  showPointOfControl: boolean;
}

export const DEFAULT_VOLUME_PROFILE: Readonly<ResolvedVolumeProfile> = {
  visible: false,
  rows: 32,
  width: 120,
  placement: "right",
  valueAreaPercent: 0.7,
  opacity: 0.24,
  pointOfControlColor: "rgba(255, 255, 255, 0.72)",
  showPointOfControl: true,
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

export function resolveVolumeProfileOptions(
  options: VolumeProfileOptions | false | null | undefined,
): ResolvedVolumeProfile {
  if (!options) {
    return { ...DEFAULT_VOLUME_PROFILE, visible: false };
  }
  const requestedValueArea = options.valueAreaPercent;
  const normalizedValueArea =
    typeof requestedValueArea === "number" && requestedValueArea > 1
      ? requestedValueArea / 100
      : requestedValueArea;
  return {
    visible: options.visible ?? true,
    rows: Math.round(clampNumber(options.rows, DEFAULT_VOLUME_PROFILE.rows, 8, 200)),
    width: clampNumber(options.width, DEFAULT_VOLUME_PROFILE.width, 24, 320),
    placement: options.placement === "left" ? "left" : "right",
    valueAreaPercent: clampNumber(
      normalizedValueArea,
      DEFAULT_VOLUME_PROFILE.valueAreaPercent,
      0.1,
      1,
    ),
    opacity: clampNumber(options.opacity, DEFAULT_VOLUME_PROFILE.opacity, 0, 1),
    upColor: typeof options.upColor === "string" ? options.upColor : undefined,
    downColor: typeof options.downColor === "string" ? options.downColor : undefined,
    pointOfControlColor:
      typeof options.pointOfControlColor === "string"
        ? options.pointOfControlColor
        : DEFAULT_VOLUME_PROFILE.pointOfControlColor,
    showPointOfControl: options.showPointOfControl ?? DEFAULT_VOLUME_PROFILE.showPointOfControl,
  };
}

function sanitizeLineDash(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.length === 0) return [];
  const result = value.filter(
    (entry): entry is number => typeof entry === "number" && Number.isFinite(entry) && entry >= 0,
  );
  return result.length > 0 ? result : undefined;
}

export function normalizePriceLines(
  value: readonly StockPriceLine[] | null | undefined,
): StockPriceLine[] {
  return Array.isArray(value)
    ? value
        .filter((line) => line && Number.isFinite(line.price))
        .map((line) => ({
          ...line,
          lineDash: sanitizeLineDash(line.lineDash),
        }))
    : [];
}

export function normalizeMarkers(value: readonly StockMarker[] | null | undefined): StockMarker[] {
  return Array.isArray(value)
    ? value
        .filter(
          (marker) =>
            marker &&
            Number.isFinite(marker.timestamp) &&
            (marker.position !== "price" || Number.isFinite(marker.price)),
        )
        .map((marker) => ({ ...marker }))
        .sort((left, right) => left.timestamp - right.timestamp)
    : [];
}

export function markerLowerBound(markers: readonly StockMarker[], target: number): number {
  let low = 0;
  let high = markers.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (markers[middle].timestamp < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function markerUpperBound(markers: readonly StockMarker[], target: number): number {
  let low = 0;
  let high = markers.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (markers[middle].timestamp <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}
