import { describe, expect, it } from "vitest";
import {
  createSeriesConfigState,
  ensureSeriesVisibility,
  getBarBaselineForBounds,
  getSeriesColor,
  getSeriesLineWidth,
  getSeriesMarker,
  getSeriesName,
  getSeriesType,
  getVisibleSeriesCount,
  isSeriesVisible,
  resetMarkerCache,
  resolveSeriesMarker,
  resolveSeriesPointOptions,
} from "./seriesConfig.js";

describe("line series configuration", () => {
  it("sanitizes aliases, colors, names, widths, and bar baselines", () => {
    const config = createSeriesConfigState();
    config.options = [
      { name: "Measured", color: "#123", type: "step-after", width: 0 },
      { type: "column", bar: { baseline: 12 } },
      { type: "not-public" as never, width: Number.NaN, unit: { name: "A" } },
    ];
    config.count = config.options.length;

    expect(getSeriesName(config, 0)).toBe("Measured");
    expect(getSeriesColor(config, 0)).toBe("#123");
    expect(getSeriesColor(config, 1)).toBe("#f97316");
    expect(getSeriesType(config, 0)).toBe("step-after");
    expect(getSeriesType(config, 2)).toBe("line");
    expect(getSeriesLineWidth(config, 0)).toBe(0);
    expect(getSeriesLineWidth(config, 2, 2)).toBe(2);
    expect(getBarBaselineForBounds(config, 1)).toBe(12);
    expect(getBarBaselineForBounds(config, 2)).toBeNull();
    expect(getSeriesName(config, 2)).toBe("A");
  });

  it("preserves visibility while the series count changes", () => {
    const config = createSeriesConfigState();
    config.visibility = [false, true];
    config.count = 3;
    expect(ensureSeriesVisibility(config, 3)).toBe(true);
    expect(config.visibility).toEqual([false, true, true]);
    expect(isSeriesVisible(config, 0)).toBe(false);
    expect(getVisibleSeriesCount(config)).toBe(2);
    expect(ensureSeriesVisibility(config, 3)).toBe(false);
  });

  it("resolves chart and series markers once and returns defensive copies", () => {
    const config = createSeriesConfigState();
    config.chartMarker = {
      shape: "square",
      size: 8,
      borderWidth: 2,
      glow: { color: "#abc", blur: 4, opacity: 0.7 },
    };
    config.options = [
      {
        marker: {
          size: 10,
          glow: { blur: -1, opacity: 2 },
        },
      },
    ];

    const resolved = resolveSeriesMarker(config, 0);
    expect(resolved).toEqual({
      shape: "square",
      size: 10,
      borderColor: "#fff",
      borderWidth: 2,
      glow: {
        enabled: true,
        color: "#abc",
        blur: 12,
        opacity: 1,
      },
    });
    expect(resolveSeriesMarker(config, 0)).toBe(resolved);

    const copy = getSeriesMarker(config, 0);
    copy.glow.blur = 99;
    expect(resolveSeriesMarker(config, 0).glow.blur).toBe(12);
    resetMarkerCache(config);
    expect(config.resolvedMarkerCache).toHaveLength(0);
  });

  it("resolves point presentation without leaking invalid values", () => {
    const config = createSeriesConfigState();
    config.options = [
      {
        color: "#456",
        point: {
          shape: "diamond",
          size: 0,
          opacity: -2,
          borderColor: "#789",
          borderWidth: -1,
        },
      },
    ];
    expect(resolveSeriesPointOptions(config, 0)).toEqual({
      shape: "diamond",
      size: 3,
      color: "#456",
      opacity: 0,
      borderColor: "#789",
      borderWidth: 0,
    });
  });
});
