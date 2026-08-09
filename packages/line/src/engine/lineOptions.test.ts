import { describe, expect, it } from "vitest";
import {
  isBarSeriesType,
  isDiscreteSeriesType,
  isRangeSeriesInput,
  isScatterSeriesType,
  isStackedAreaSeriesType,
  isStepSeriesType,
  parseDashStyle,
  parseLegendSwatchShape,
  parseStackCurveStyle,
  resolvePresentationDensity,
  resolvePresentationQuantizationStep,
  resolvePresentationRebaseRatio,
  reverseStackCurve,
  stackCurveToSeriesType,
  type LegendSwatchShape,
  type LineSeriesType,
  type StackCurveStyle,
} from "./lineOptions.js";

describe("line renderer option helpers", () => {
  it("clamps presentation controls and preserves explicit fallbacks", () => {
    expect(resolvePresentationDensity(0.1)).toBe(0.25);
    expect(resolvePresentationDensity(3)).toBe(2);
    expect(resolvePresentationDensity(Number.NaN, 1.25)).toBe(1.25);

    expect(resolvePresentationRebaseRatio(1)).toBe(1.05);
    expect(resolvePresentationRebaseRatio(3)).toBe(2);
    expect(resolvePresentationRebaseRatio(undefined, 1.4)).toBe(1.4);

    expect(resolvePresentationQuantizationStep(0.01)).toBe(0.05);
    expect(resolvePresentationQuantizationStep(2)).toBe(1);
    expect(resolvePresentationQuantizationStep(null, 0.5)).toBe(0.5);
  });

  it("classifies every public series alias", () => {
    expect(isScatterSeriesType("scatter")).toBe(true);
    expect(isScatterSeriesType("points")).toBe(true);
    expect(isBarSeriesType("bar")).toBe(true);
    expect(isBarSeriesType("column")).toBe(true);
    expect(isStackedAreaSeriesType("stacked-area")).toBe(true);
    expect(isStackedAreaSeriesType("stackedArea")).toBe(true);
    for (const type of [
      "step",
      "step-before",
      "step-after",
      "step-mid",
    ] satisfies LineSeriesType[]) {
      expect(isStepSeriesType(type)).toBe(true);
    }
    expect(isDiscreteSeriesType("points")).toBe(true);
    expect(isDiscreteSeriesType("column")).toBe(true);
    expect(isDiscreteSeriesType("line")).toBe(false);
  });

  it("sanitizes dash, swatch, and stack-curve inputs", () => {
    for (const style of ["solid", "dashed", "dotted"] as const) {
      expect(parseDashStyle(style)).toBe(style);
    }
    expect(parseDashStyle(undefined)).toBe("solid");

    for (const shape of [
      "circle",
      "square",
      "diamond",
      "triangle",
      "cross",
      "x",
      "line",
    ] satisfies LegendSwatchShape[]) {
      expect(parseLegendSwatchShape(shape)).toBe(shape);
    }
    expect(parseLegendSwatchShape("hexagon")).toBeNull();

    for (const curve of [
      "step",
      "step-before",
      "step-after",
      "step-mid",
    ] satisfies StackCurveStyle[]) {
      expect(parseStackCurveStyle(curve)).toBe(curve);
    }
    expect(parseStackCurveStyle(undefined)).toBe("linear");
  });

  it("maps and reverses stacked-area boundary curves", () => {
    expect(stackCurveToSeriesType("linear")).toBe("line");
    expect(stackCurveToSeriesType("step-mid")).toBe("step-mid");
    expect(reverseStackCurve("step")).toBe("step-before");
    expect(reverseStackCurve("step-after")).toBe("step-before");
    expect(reverseStackCurve("step-before")).toBe("step-after");
    expect(reverseStackCurve("step-mid")).toBe("step-mid");
    expect(reverseStackCurve("linear")).toBe("linear");
  });

  it("accepts only typed lower/upper range inputs", () => {
    expect(isRangeSeriesInput(new Float64Array([1, 2]))).toBe(false);
    expect(
      isRangeSeriesInput({
        low: new Float64Array([1]),
        high: new Float64Array([2]),
      }),
    ).toBe(true);
    expect(
      isRangeSeriesInput({
        low: [1],
        high: new Float64Array([2]),
      } as never),
    ).toBe(false);
  });
});
