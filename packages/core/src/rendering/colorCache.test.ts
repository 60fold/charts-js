import { describe, expect, it } from "vitest";
import { colorCache, getCachedRgba, isOpaqueColor, normalizeColor } from "./colorCache";

describe("getCachedRgba", () => {
  it("applies alpha to rgb and rgba colors", () => {
    colorCache.clear();

    expect(getCachedRgba("rgb(10, 20, 30)", 0.25)).toBe("rgba(10, 20, 30, 0.25)");
    expect(getCachedRgba("rgba(10, 20, 30, 0.5)", 0.5)).toBe("rgba(10, 20, 30, 0.25)");
    expect(getCachedRgba("rgb(10, 20, 30)", 0.1236)).toBe("rgba(10, 20, 30, 0.124)");
    expect(getCachedRgba("rgb(10, 20, 30)", Number.NaN)).toBe("rgba(10, 20, 30, 1)");
  });

  it("bounds cache growth across many colors", () => {
    colorCache.clear();

    for (let i = 0; i < 5000; i++) {
      getCachedRgba(`#${i.toString(16).padStart(6, "0").slice(-6)}`, 0.5);
    }

    expect(colorCache.size).toBeLessThanOrEqual(4096);
  });

  it("normalizes valid 8-digit hex colors and leaves malformed ones unchanged", () => {
    expect(normalizeColor("#11223344")).toBe("rgba(17,34,51,0.26666666666666666)");
    expect(normalizeColor("#zzzzzzzz")).toBe("#zzzzzzzz");
  });

  it("accepts the parser sentinel color as a normal input", () => {
    expect(getCachedRgba("#010203", 0.5)).toBe("rgba(1, 2, 3, 0.5)");
  });
});

describe("isOpaqueColor", () => {
  it("accepts opaque CSS colors and rejects colors with alpha", () => {
    expect(isOpaqueColor("#123456")).toBe(true);
    expect(isOpaqueColor("#abc")).toBe(true);
    expect(isOpaqueColor("rgb(12, 34, 56)")).toBe(true);
    expect(isOpaqueColor("#12345680")).toBe(false);
    expect(isOpaqueColor("rgba(12, 34, 56, 0.5)")).toBe(false);
  });
});
