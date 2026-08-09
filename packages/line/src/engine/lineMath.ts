import type { RenderContext2D, UnitOptions } from "@sixtyfold/core/internal/renderer";
import { formatValue } from "@sixtyfold/core/internal/renderer";

export function clampLegendOffset(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(value, max));
}

export function fillHorizontalStepSegment(
  context: RenderContext2D,
  fromX: number,
  toX: number,
  y: number,
  width: number,
): void {
  if (fromX === toX) return;
  const halfWidth = width * 0.5;
  context.fillRect(
    Math.min(fromX, toX) - halfWidth,
    y - halfWidth,
    Math.abs(toX - fromX) + width,
    width,
  );
}

export function fillVerticalStepSegment(
  context: RenderContext2D,
  x: number,
  fromY: number,
  toY: number,
  width: number,
): void {
  if (fromY === toY) return;
  const halfWidth = width * 0.5;
  context.fillRect(
    x - halfWidth,
    Math.min(fromY, toY) - halfWidth,
    width,
    Math.abs(toY - fromY) + width,
  );
}

/**
 * Append the Catmull–Rom segment from p1 to p2 as an exactly equivalent
 * cubic Bézier while keeping x(t) linear.
 */
export function appendSplineSegment(
  context: RenderContext2D,
  p0Y: number,
  p1X: number,
  p1Y: number,
  p2X: number,
  p2Y: number,
  p3Y: number,
): void {
  const controlXOffset = (p2X - p1X) / 3;
  context.bezierCurveTo(
    p1X + controlXOffset,
    p1Y + (p2Y - p0Y) / 6,
    p2X - controlXOffset,
    p2Y - (p3Y - p1Y) / 6,
    p2X,
    p2Y,
  );
}

export function catmullRomInterpolate(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export function formatRangeValue(low: number, high: number, unit: UnitOptions | undefined): string {
  return `${formatValue(low, unit)} - ${formatValue(high, unit)}`;
}
