import type { DeepPartial, DeepReadonly } from "@sixtyfold/core";
import type { LineAppearanceOptions, LineChart, SeriesAppearanceOptions } from "@sixtyfold/line";
import { LINE_THEME_DATA } from "./lineCatalog.generated.js";
export { PUBLIC_THEME_IDS, type ChartThemeId } from "./themeIds.js";
import type { ChartThemeId } from "./themeIds.js";

/** A line-only view of one recursively frozen public theme preset. */
export type LineThemePreset = DeepReadonly<{
  id: ChartThemeId;
  label: string;
  colorScheme: "dark" | "light";
  line: {
    appearance: DeepPartial<LineAppearanceOptions>;
    series: DeepPartial<SeriesAppearanceOptions>[];
  };
}>;

/** Return a public theme without requiring the stock package's declarations. */
export function getLineThemePreset(id: ChartThemeId): LineThemePreset {
  const preset = (LINE_THEME_DATA as unknown as Readonly<Record<string, LineThemePreset>>)[id];
  if (!preset) {
    throw new RangeError(`Unknown Sixtyfold chart theme: ${String(id)}`);
  }
  return preset;
}

/** Apply a public theme to a line chart. */
export function applyLineTheme(chart: LineChart, id: ChartThemeId): void {
  const preset = getLineThemePreset(id);
  chart.updateAppearance(preset.line.appearance);
  preset.line.series.forEach((appearance, index) => {
    chart.updateSeriesAppearance(index, appearance);
  });
}
