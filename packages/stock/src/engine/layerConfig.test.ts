import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOLUME_PROFILE,
  markerLowerBound,
  markerUpperBound,
  normalizeMarkers,
  normalizePriceLines,
  resolveVolumeProfileOptions,
} from "./layerConfig.js";

describe("volume profile options", () => {
  it("resolves defaults, percentages, and bounded dimensions", () => {
    expect(resolveVolumeProfileOptions(false)).toEqual({
      ...DEFAULT_VOLUME_PROFILE,
      visible: false,
    });
    expect(
      resolveVolumeProfileOptions({
        rows: 4,
        width: 1_000,
        valueAreaPercent: 70,
        opacity: -1,
        placement: "left",
        upColor: "#0f0",
        downColor: "#f00",
        showPointOfControl: false,
      }),
    ).toMatchObject({
      visible: true,
      rows: 8,
      width: 320,
      valueAreaPercent: 0.7,
      opacity: 0,
      placement: "left",
      upColor: "#0f0",
      downColor: "#f00",
      showPointOfControl: false,
    });
  });

  it("falls back for invalid values and accepts explicit visibility", () => {
    const result = resolveVolumeProfileOptions({
      visible: false,
      rows: Number.NaN,
      width: Number.NaN,
      valueAreaPercent: Number.NaN,
      opacity: Number.NaN,
      pointOfControlColor: "#abc",
    });
    expect(result).toMatchObject({
      visible: false,
      rows: DEFAULT_VOLUME_PROFILE.rows,
      width: DEFAULT_VOLUME_PROFILE.width,
      valueAreaPercent: DEFAULT_VOLUME_PROFILE.valueAreaPercent,
      opacity: DEFAULT_VOLUME_PROFILE.opacity,
      pointOfControlColor: "#abc",
    });
  });
});

describe("stock layer normalization", () => {
  it("filters price lines and sanitizes dash patterns without mutation", () => {
    const source = [
      { price: 10, lineDash: [4, -1, Number.NaN, 2] },
      { price: 20, lineDash: [] },
      { price: Number.NaN },
    ];
    const normalized = normalizePriceLines(source);

    expect(normalized).toEqual([
      { price: 10, lineDash: [4, 2] },
      { price: 20, lineDash: [] },
    ]);
    expect(normalized[0]).not.toBe(source[0]);
    expect(source[0].lineDash).toEqual([4, -1, Number.NaN, 2]);
  });

  it("filters invalid markers, clones them, and sorts by timestamp", () => {
    const source = [
      { timestamp: 30, label: "last" },
      { timestamp: Number.NaN },
      { timestamp: 10, position: "price" as const },
      { timestamp: 20, position: "price" as const, price: 5 },
    ];
    const normalized = normalizeMarkers(source);

    expect(normalized.map((marker) => marker.timestamp)).toEqual([20, 30]);
    expect(normalized[1]).not.toBe(source[0]);
  });

  it("finds inclusive marker boundaries with duplicate timestamps", () => {
    const markers = normalizeMarkers([
      { timestamp: 10 },
      { timestamp: 20 },
      { timestamp: 20 },
      { timestamp: 30 },
    ]);

    expect(markerLowerBound(markers, 20)).toBe(1);
    expect(markerUpperBound(markers, 20)).toBe(3);
    expect(markerLowerBound(markers, 5)).toBe(0);
    expect(markerUpperBound(markers, 40)).toBe(4);
  });
});
