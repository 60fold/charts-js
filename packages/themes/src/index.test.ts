import { describe, expect, it } from "vitest";
import { PUBLIC_THEME_IDS, PUBLIC_THEMES, getThemePreset } from "./index.js";
import { getLineThemePreset } from "./line.js";
import { getStockThemePreset } from "./stock.js";

describe("public chart themes", () => {
  it("exports the complete public catalog without retired or internal themes", () => {
    expect(PUBLIC_THEME_IDS).toHaveLength(14);
    for (const id of ["draft", "quartz", "mercury", "ivory", "arabicRtl"]) {
      expect(PUBLIC_THEME_IDS).not.toContain(id);
    }
    expect(Object.keys(PUBLIC_THEMES)).toEqual([...PUBLIC_THEME_IDS]);
    expect(getThemePreset("default").label).toBe("Midnight");
    const newLightThemeIds = ["bauhaus", "washi", "botanica", "newsprint"] as const;
    expect(newLightThemeIds.map((id) => getThemePreset(id).colorScheme)).toEqual([
      "light",
      "light",
      "light",
      "light",
    ]);
    expect(PUBLIC_THEME_IDS.filter((id) => getThemePreset(id).colorScheme === "dark")).toHaveLength(
      7,
    );
    expect(
      PUBLIC_THEME_IDS.filter((id) => getThemePreset(id).colorScheme === "light"),
    ).toHaveLength(7);
  });

  it("deep-freezes complete content-neutral presets", () => {
    expect(Object.isFrozen(PUBLIC_THEME_IDS)).toBe(true);
    expect(Object.isFrozen(PUBLIC_THEMES)).toBe(true);

    for (const id of PUBLIC_THEME_IDS) {
      const preset = getThemePreset(id);
      expect(preset.id).toBe(id);
      expect(preset.line.appearance).toBeDefined();
      expect(preset.line.series.length).toBeGreaterThan(0);
      expect(preset.stock.appearance).toBeDefined();
      expect(Object.isFrozen(preset)).toBe(true);
      expect(Object.isFrozen(preset.line.appearance)).toBe(true);
      expect(preset.line.appearance).not.toHaveProperty("labels");
      expect(preset.stock.appearance).not.toHaveProperty("labels");
      expect(preset).not.toHaveProperty("ambient");
      expect(preset).not.toHaveProperty("section");
    }
  });

  it("rejects an unknown runtime identifier", () => {
    for (const id of ["draft", "quartz", "mercury", "ivory", "arabicRtl"]) {
      expect(() => getThemePreset(id as never)).toThrow(RangeError);
    }
  });

  it("exposes line-only and stock-only typed views of the frozen catalog", () => {
    const line = getLineThemePreset("blueprint");
    const stock = getStockThemePreset("mainframe");
    expect(line).toEqual({
      id: "blueprint",
      label: "Blueprint",
      colorScheme: "dark",
      line: getThemePreset("blueprint").line,
    });
    expect(stock).toEqual({
      id: "mainframe",
      label: "Mainframe",
      colorScheme: "dark",
      stock: getThemePreset("mainframe").stock,
    });
    expect(Object.isFrozen(line)).toBe(true);
    expect(Object.isFrozen(stock)).toBe(true);
  });

  it("rejects unknown runtime identifiers through focused entry points", () => {
    for (const id of ["draft", "quartz", "mercury", "ivory", "arabicRtl"]) {
      expect(() => getLineThemePreset(id as never)).toThrow(RangeError);
      expect(() => getStockThemePreset(id as never)).toThrow(RangeError);
    }
  });
});
