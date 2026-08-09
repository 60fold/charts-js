import type { DeepPartial, DeepReadonly } from "@sixtyfold/core";
import type { StockAppearanceOptions, StockChart } from "@sixtyfold/stock";
import { STOCK_THEME_DATA } from "./stockCatalog.generated.js";
export { PUBLIC_THEME_IDS, type ChartThemeId } from "./themeIds.js";
import type { ChartThemeId } from "./themeIds.js";

/** A stock-only view of one recursively frozen public theme preset. */
export type StockThemePreset = DeepReadonly<{
  id: ChartThemeId;
  label: string;
  colorScheme: "dark" | "light";
  stock: {
    appearance: DeepPartial<StockAppearanceOptions>;
  };
}>;

/** Return a public theme without requiring the line package's declarations. */
export function getStockThemePreset(id: ChartThemeId): StockThemePreset {
  const preset = (STOCK_THEME_DATA as unknown as Readonly<Record<string, StockThemePreset>>)[id];
  if (!preset) {
    throw new RangeError(`Unknown Sixtyfold chart theme: ${String(id)}`);
  }
  return preset;
}

/** Apply a public theme to a stock chart. */
export function applyStockTheme(chart: StockChart, id: ChartThemeId): void {
  chart.updateAppearance(getStockThemePreset(id).stock.appearance);
}
