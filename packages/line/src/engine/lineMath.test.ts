import { describe, expect, it, vi } from "vitest";
import {
  appendSplineSegment,
  catmullRomInterpolate,
  clampLegendOffset,
  fillHorizontalStepSegment,
  fillVerticalStepSegment,
  formatRangeValue,
} from "./lineMath.js";

describe("line renderer math helpers", () => {
  it("clamps legend offsets into their available span", () => {
    expect(clampLegendOffset(-5, 20)).toBe(0);
    expect(clampLegendOffset(7, 20)).toBe(7);
    expect(clampLegendOffset(25, 20)).toBe(20);
    expect(clampLegendOffset(5, 0)).toBe(0);
  });

  it("fills horizontal and vertical step segments without zero-length draws", () => {
    const fillRect = vi.fn();
    const context = { fillRect } as unknown as CanvasRenderingContext2D;

    fillHorizontalStepSegment(context, 4, 10, 20, 2);
    expect(fillRect).toHaveBeenLastCalledWith(3, 19, 8, 2);
    fillVerticalStepSegment(context, 12, 30, 20, 2);
    expect(fillRect).toHaveBeenLastCalledWith(11, 19, 2, 12);

    fillHorizontalStepSegment(context, 4, 4, 20, 2);
    fillVerticalStepSegment(context, 12, 30, 30, 2);
    expect(fillRect).toHaveBeenCalledTimes(2);
  });

  it("converts a Catmull–Rom segment to the matching cubic Bézier", () => {
    const bezierCurveTo = vi.fn();
    const context = { bezierCurveTo } as unknown as CanvasRenderingContext2D;
    appendSplineSegment(context, 2, 3, 6, 15, 18, 26);
    expect(bezierCurveTo).toHaveBeenCalledWith(7, 8 + 2 / 3, 11, 18 - 20 / 6, 15, 18);
  });

  it("interpolates exact endpoints and the known midpoint", () => {
    expect(catmullRomInterpolate(0, 10, 20, 30, 0)).toBe(10);
    expect(catmullRomInterpolate(0, 10, 20, 30, 1)).toBe(20);
    expect(catmullRomInterpolate(0, 10, 20, 30, 0.5)).toBe(15);
  });

  it("formats both range bounds with the same unit contract", () => {
    expect(
      formatRangeValue(1.25, 2.5, {
        prefix: "$",
        suffix: " USD",
        decimals: 1,
      }),
    ).toBe("$1.3 USD - $2.5 USD");
  });
});
