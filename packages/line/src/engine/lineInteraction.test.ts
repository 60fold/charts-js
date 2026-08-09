import { describe, expect, it, vi } from "vitest";
import {
  buildLineTooltipContent,
  getDisplayRange,
  getDisplayY,
  getMarkerY,
  type DataPointResult,
} from "./lineInteraction.js";

describe("line interaction values", () => {
  it("resolves raw, interpolated, and stacked marker values", () => {
    const raw: DataPointResult = {
      x: 1,
      y: 2,
      idx: 0,
      isInterpolated: false,
    };
    const interpolated: DataPointResult = {
      ...raw,
      isInterpolated: true,
      interpolatedY: 3,
      stackedY: 4,
      interpolatedStackedY: 5,
    };

    expect(getDisplayY(raw)).toBe(2);
    expect(getMarkerY(raw)).toBe(2);
    expect(getDisplayY(interpolated)).toBe(3);
    expect(getMarkerY(interpolated)).toBe(5);
  });

  it("normalizes finite range boundaries and rejects incomplete ranges", () => {
    const point: DataPointResult = {
      x: 1,
      y: 2,
      idx: 0,
      isInterpolated: true,
      low: 1,
      high: 4,
      interpolatedLow: 8,
      interpolatedHigh: 3,
    };

    expect(getDisplayRange(point)).toEqual({ low: 3, high: 8 });
    expect(getDisplayRange({ ...point, interpolatedHigh: Number.NaN })).toBeNull();
    expect(
      getDisplayRange({
        x: 1,
        y: 2,
        idx: 0,
        isInterpolated: false,
      }),
    ).toBeNull();
  });
});

describe("line tooltip content", () => {
  it("filters series and formats scalar and range values", () => {
    const isSeriesVisible = vi.fn((index: number) => index !== 2);
    const content = buildLineTooltipContent({
      title: "12:00",
      points: [
        { x: 1, y: 10, idx: 0, isInterpolated: false },
        {
          x: 1,
          y: 20,
          idx: 0,
          low: 18,
          high: 24,
          isInterpolated: false,
        },
        { x: 1, y: 30, idx: 0, isInterpolated: false },
      ],
      seriesCount: 3,
      visibleSeries: [1, 2, -1, 4],
      isSeriesVisible,
      getSeriesUnit: () => ({ suffix: " A", precision: 0 }),
      getSeriesName: (index) => `Series ${index}`,
      getSeriesColor: (index) => `color-${index}`,
    });

    expect(content).toEqual({
      visible: true,
      title: "12:00",
      rows: [
        {
          label: "Series 1",
          value: "18.00 A - 24.00 A",
          color: "color-1",
          dimmed: false,
        },
      ],
    });
    expect(isSeriesVisible).toHaveBeenCalledTimes(2);
  });

  it("uses every configured series when no filter is supplied", () => {
    const content = buildLineTooltipContent({
      title: "Now",
      points: [{ x: 1, y: 1.25, idx: 0, isInterpolated: false }, null],
      seriesCount: 2,
      isSeriesVisible: () => true,
      getSeriesUnit: () => ({ decimals: 2 }),
      getSeriesName: (index) => `S${index}`,
      getSeriesColor: () => "#fff",
    });

    expect(content.rows).toEqual([
      {
        label: "S0",
        value: "1.25",
        color: "#fff",
        dimmed: false,
      },
    ]);
  });
});
