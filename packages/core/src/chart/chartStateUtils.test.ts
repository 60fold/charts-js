import { describe, expect, it } from "vitest";

import { deepClone, deepMerge } from "./chartStateUtils";

describe("chartStateUtils", () => {
  describe("isPlainObject() boundaries via cloning", () => {
    it("preserves class instances by reference", () => {
      class FakeImageBitmap {}

      const bitmap = new FakeImageBitmap();
      const cloned = deepClone({ bitmap });

      expect(cloned.bitmap).toBe(bitmap);
    });
  });

  describe("deepClone()", () => {
    it("clones top-level arrays recursively", () => {
      const source = [{ color: "#111" }, ["a", { color: "#222" }]];

      const cloned = deepClone(source);

      expect(cloned).toEqual(source);
      expect(cloned).not.toBe(source);
      expect(cloned[0]).not.toBe(source[0]);
      expect(cloned[1]).not.toBe(source[1]);
      expect((cloned[1] as Array<unknown>)[1]).not.toBe((source[1] as Array<unknown>)[1]);
    });
  });

  describe("deepMerge()", () => {
    it("does not retain object references when replacing a scalar with an object", () => {
      const target: Record<string, unknown> = { chartBackground: "#050505" };
      const noirBackground = {
        type: "gradient",
        direction: "vertical",
        colors: ["#050505", "#151515", "#080808"],
      };

      deepMerge(target, { chartBackground: noirBackground });

      expect(target.chartBackground).toEqual(noirBackground);
      expect(target.chartBackground).not.toBe(noirBackground);
    });

    it("does not mutate previously merged source objects on later merges", () => {
      const target: Record<string, unknown> = { chartBackground: "#050505" };
      const noirBackground = {
        type: "gradient",
        direction: "vertical",
        colors: ["#050505", "#151515", "#080808"],
      };
      const technicolorBackground = {
        type: "gradient",
        direction: "vertical",
        colors: ["#12061d", "#2b1452", "#a32c5a", "#ff914d"],
        offsets: [0, 0.34, 0.74, 1],
      };

      deepMerge(target, { chartBackground: noirBackground });
      deepMerge(target, { chartBackground: technicolorBackground });

      expect(noirBackground).toEqual({
        type: "gradient",
        direction: "vertical",
        colors: ["#050505", "#151515", "#080808"],
      });
      expect("offsets" in noirBackground).toBe(false);
    });
  });
});
