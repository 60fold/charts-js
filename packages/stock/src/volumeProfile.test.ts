import { describe, expect, it } from "vitest";
import { accumulateEstimatedCandleVolume } from "./volumeProfile.js";

describe("estimated candle-derived volume profile", () => {
  it("distributes volume uniformly across the candle price range", () => {
    const profile = new Float64Array(4);

    const allocated = accumulateEstimatedCandleVolume(profile, 0, 4, 100, 0, 4);

    expect(allocated).toBeCloseTo(100);
    expect([...profile]).toEqual([25, 25, 25, 25]);
  });

  it("counts only the portion overlapping the visible price range", () => {
    const profile = new Float64Array(4);

    const allocated = accumulateEstimatedCandleVolume(profile, -2, 2, 100, 0, 4);

    expect(allocated).toBeCloseTo(50);
    expect([...profile]).toEqual([25, 25, 0, 0]);
  });

  it("assigns a flat candle to its single visible row", () => {
    const profile = new Float64Array(4);

    const allocated = accumulateEstimatedCandleVolume(profile, 4, 4, 20, 0, 4);

    expect(allocated).toBe(20);
    expect([...profile]).toEqual([0, 0, 0, 20]);
  });
});
