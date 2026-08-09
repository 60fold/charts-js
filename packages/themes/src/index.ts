import { DEFAULT_CHART_FONT_FAMILY } from "@sixtyfold/core";
import type { DeepPartial, DeepReadonly } from "@sixtyfold/core";
export type { DeepReadonly } from "@sixtyfold/core";
import type { ChartThemeId } from "./themeIds.js";
export { PUBLIC_THEME_IDS, type ChartThemeId } from "./themeIds.js";
import type {
  LineChart,
  LineAppearanceOptions,
  MarkerShape,
  SeriesAppearanceOptions,
} from "@sixtyfold/line";
import type { StockAppearanceOptions, StockChart } from "@sixtyfold/stock";

/** A recursively frozen, chart-only visual preset for line and stock charts. */
export type ChartThemePreset = DeepReadonly<{
  /** Stable catalog identifier. */
  id: ChartThemeId;
  /** Human-readable English display name. */
  label: string;
  /** Recommended surrounding-page color scheme. */
  colorScheme: "dark" | "light";
  /** Line-chart appearance and repeating per-series visual patches. */
  line: {
    /** Content-neutral patch for `LineChart.updateAppearance`. */
    appearance: DeepPartial<LineAppearanceOptions>;
    /** Repeating visual patches for `LineChart.updateSeriesAppearance`. */
    series: DeepPartial<SeriesAppearanceOptions>[];
  };
  /** Stock-chart appearance patch. */
  stock: {
    /** Content-neutral patch for `StockChart.updateAppearance`. */
    appearance: DeepPartial<StockAppearanceOptions>;
  };
}>;

interface GradientPalette {
  type: "gradient";
  direction: "vertical";
  colors: string[];
  offsets?: number[];
}

interface ThemePalette {
  id: ChartThemeId;
  label: string;
  colorScheme: "dark" | "light";
  background: string | GradientPalette;
  grid: string;
  gridWidth: number;
  axis: string;
  axisLabel: string;
  bottomTick?: string;
  leftAxisLabel?: string;
  rightAxisLabel: string;
  bottomCursor: string;
  rightCursor: string;
  bottomCursorText: string;
  rightCursorText: string;
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipBorderWidth: number;
  tooltipRadius: number;
  tooltipBlur: number;
  tooltipTitle: string;
  tooltipLabel: string;
  tooltipValue: string;
  crosshairVertical: string;
  crosshairHorizontal: string;
  selection: string;
  selectionBorder: string;
  selectionStyle?: "solid" | "dashed" | "dotted";
  rangeOverlay: string;
  rangeHandle: string;
  rangeGrip: string;
  rangeBorder: string;
  legend: string;
  legendSwatchSize?: number;
  marker: MarkerShape;
  markerSize: number;
  markerBorder: string;
  markerGlow: number;
  markerGlowOpacity: number;
  series: readonly {
    color: string;
    width: number;
    marker: MarkerShape;
  }[];
  candles: {
    up: string;
    down: string;
    wickUp: string;
    wickDown: string;
  };
  candleStrokeWidth: number;
  previewLine: string;
}

const gradient = (colors: string[], offsets?: number[]): GradientPalette => ({
  type: "gradient",
  direction: "vertical",
  colors,
  ...(offsets ? { offsets } : {}),
});

const series = (
  colors: readonly string[],
  width: number | readonly number[],
  markers: readonly MarkerShape[] = ["diamond", "circle", "square", "triangle", "x", "cross"],
): ThemePalette["series"] =>
  colors.map((color, index) => ({
    color,
    width: typeof width === "number" ? width : (width[index] ?? width[0] ?? 1),
    marker: markers[index % markers.length] ?? "circle",
  }));

const palettes: readonly ThemePalette[] = [
  {
    id: "default",
    label: "Midnight",
    colorScheme: "dark",
    background: gradient(["#171a31", "#131f3b", "#0c1024"]),
    grid: "#304d7a",
    gridWidth: 0.5,
    axis: "#5173a1",
    axisLabel: "#909eae",
    rightAxisLabel: "#909eae",
    bottomCursor: "#303743",
    rightCursor: "#2e61db",
    bottomCursorText: "#f9fbff",
    rightCursorText: "#f9fbff",
    tooltipBackground: "rgba(7, 11, 23, 0.54)",
    tooltipBorder: "rgba(101, 144, 218, 0.72)",
    tooltipBorderWidth: 0,
    tooltipRadius: 6,
    tooltipBlur: 4,
    tooltipTitle: "#edf3ff",
    tooltipLabel: "#d5e1f3",
    tooltipValue: "#fbfdff",
    crosshairVertical: "#f7fbff42",
    crosshairHorizontal: "#f7fbff24",
    selection: "rgba(83, 149, 226, 0.16)",
    selectionBorder: "#5798dc",
    selectionStyle: "solid",
    rangeOverlay: "rgba(0, 2, 10, 0.64)",
    rangeHandle: "#5798dc",
    rangeGrip: "#f6f9ff",
    rangeBorder: "#5273a0",
    legend: "#d9e1ef",
    marker: "circle",
    markerSize: 6,
    markerBorder: "#f7fbffd1",
    markerGlow: 12,
    markerGlowOpacity: 1,
    series: series(
      ["#e94e9b", "#f37d24", "#4389ee", "#f04c50", "#a660ed", "#28c26a"],
      [1.8, 1.8, 1.8, 1.6, 1.8, 1.8],
      ["circle", "square", "diamond", "triangle", "x", "diamond"],
    ),
    candles: {
      up: "#2aa89c",
      down: "#ed5955",
      wickUp: "#2aa89c",
      wickDown: "#ed5955",
    },
    candleStrokeWidth: 1,
    previewLine: "#5798dc",
  },
  {
    id: "mainframe",
    label: "Mainframe",
    colorScheme: "dark",
    background: "#050505",
    grid: "#2a5a2a",
    gridWidth: 0.3,
    axis: "#1a8a2e",
    axisLabel: "#1a8a2e",
    rightAxisLabel: "#1a8a2e",
    bottomCursor: "#0d3a12",
    rightCursor: "#0d3a12",
    bottomCursorText: "#30b848",
    rightCursorText: "#30b848",
    tooltipBackground: "rgba(2, 10, 2, 0.86)",
    tooltipBorder: "#1a8a2e",
    tooltipBorderWidth: 1,
    tooltipRadius: 2,
    tooltipBlur: 0,
    tooltipTitle: "#85ffad",
    tooltipLabel: "#62d07b",
    tooltipValue: "#bfffd2",
    crosshairVertical: "rgba(0, 200, 60, 0.3)",
    crosshairHorizontal: "rgba(0, 200, 60, 0.15)",
    selection: "rgba(0, 180, 50, 0.1)",
    selectionBorder: "#1a8a2e",
    rangeOverlay: "rgba(0, 0, 0, 0.7)",
    rangeHandle: "#1a8a2e",
    rangeGrip: "#050505",
    rangeBorder: "#0d5c1a",
    legend: "#30b848",
    marker: "square",
    markerSize: 5,
    markerBorder: "#052008",
    markerGlow: 10,
    markerGlowOpacity: 0.8,
    series: series(["#00cc44", "#0d5c1a", "#30b848", "#134d1e", "#22dd55", "#1a7a2a"], 1.8, [
      "square",
      "diamond",
      "circle",
      "triangle",
      "x",
      "cross",
    ]),
    candles: {
      up: "#00cc44",
      down: "#0d5c1a",
      wickUp: "#00cc44",
      wickDown: "#0d5c1a",
    },
    candleStrokeWidth: 1,
    previewLine: "#1a8a2e",
  },
  {
    id: "blueprint",
    label: "Blueprint",
    colorScheme: "dark",
    background: gradient(["#07111f", "#0c2744", "#08192e"]),
    grid: "rgba(124, 231, 255, 0.14)",
    gridWidth: 0.45,
    axis: "#6dd9ff",
    axisLabel: "#bcefff",
    bottomTick: "rgba(124, 231, 255, 0.55)",
    leftAxisLabel: "#8fdfff",
    rightAxisLabel: "#e8fbff",
    bottomCursor: "#0e3657",
    rightCursor: "#1f5d87",
    bottomCursorText: "#dbf8ff",
    rightCursorText: "#f4fdff",
    tooltipBackground: "rgba(5, 16, 31, 0.82)",
    tooltipBorder: "rgba(124, 231, 255, 0.65)",
    tooltipBorderWidth: 1,
    tooltipRadius: 6,
    tooltipBlur: 5,
    tooltipTitle: "#dff8ff",
    tooltipLabel: "#a7e7ff",
    tooltipValue: "#ffffff",
    crosshairVertical: "rgba(124, 231, 255, 0.34)",
    crosshairHorizontal: "rgba(124, 231, 255, 0.15)",
    selection: "rgba(124, 231, 255, 0.1)",
    selectionBorder: "#7ce7ff",
    selectionStyle: "dashed",
    rangeOverlay: "rgba(3, 10, 20, 0.72)",
    rangeHandle: "#7ce7ff",
    rangeGrip: "#08203a",
    rangeBorder: "#2ca7d2",
    legend: "#dff7ff",
    legendSwatchSize: 14,
    marker: "diamond",
    markerSize: 6,
    markerBorder: "#dff8ff",
    markerGlow: 12,
    markerGlowOpacity: 0.65,
    series: series(["#7ce7ff", "#36c4ff", "#94ffe1", "#f4f7fb", "#4f8bff", "#ffcf7a"], 2, [
      "diamond",
      "square",
      "circle",
      "triangle",
      "x",
      "cross",
    ]),
    candles: {
      up: "#89f0ff",
      down: "#4f8bff",
      wickUp: "#d4fbff",
      wickDown: "#82a9ff",
    },
    candleStrokeWidth: 1.2,
    previewLine: "#7ce7ff",
  },
  {
    id: "porcelain",
    label: "Porcelain",
    colorScheme: "light",
    background: gradient(["#ffffff", "#eef5f6", "#dbe8ea"]),
    grid: "rgba(86, 110, 118, 0.12)",
    gridWidth: 0.45,
    axis: "#708891",
    axisLabel: "#48606a",
    bottomTick: "rgba(86, 110, 118, 0.38)",
    rightAxisLabel: "#5a9c9d",
    bottomCursor: "#2f4650",
    rightCursor: "#5a9c9d",
    bottomCursorText: "#f8fcfd",
    rightCursorText: "#f8fcfd",
    tooltipBackground: "rgba(251, 254, 254, 0.82)",
    tooltipBorder: "rgba(64, 86, 93, 0.18)",
    tooltipBorderWidth: 0.5,
    tooltipRadius: 6,
    tooltipBlur: 7,
    tooltipTitle: "#1b262a",
    tooltipLabel: "#567079",
    tooltipValue: "#4c8194",
    crosshairVertical: "rgba(76, 129, 148, 0.18)",
    crosshairHorizontal: "rgba(86, 110, 118, 0.1)",
    selection: "rgba(90, 156, 157, 0.08)",
    selectionBorder: "#5a9c9d",
    selectionStyle: "solid",
    rangeOverlay: "rgba(111, 131, 136, 0.16)",
    rangeHandle: "#7aa9b3",
    rangeGrip: "#f7fcfd",
    rangeBorder: "#708891",
    legend: "#31474f",
    legendSwatchSize: 13,
    marker: "diamond",
    markerSize: 5,
    markerBorder: "#ffffff",
    markerGlow: 12,
    markerGlowOpacity: 0.42,
    series: series(["#5a9c9d", "#6a7ea8", "#d28f6d", "#4c8194", "#7e9e62", "#7f6f8f"], 1.95),
    candles: {
      up: "#5a9c9d",
      down: "#d28f6d",
      wickUp: "#87b9ba",
      wickDown: "#e0ac91",
    },
    candleStrokeWidth: 1,
    previewLine: "#708891",
  },
  {
    id: "azulejo",
    label: "Azulejo",
    colorScheme: "light",
    background: gradient(["#ffffff", "#eff5f8", "#d7e5ef"]),
    grid: "rgba(35, 87, 160, 0.12)",
    gridWidth: 0.45,
    axis: "#6a86ad",
    axisLabel: "#355072",
    bottomTick: "rgba(35, 87, 160, 0.34)",
    rightAxisLabel: "#173463",
    bottomCursor: "#2357a0",
    rightCursor: "#c28b3c",
    bottomCursorText: "#f8fbfd",
    rightCursorText: "#f8fbfd",
    tooltipBackground: "rgba(252, 254, 255, 0.82)",
    tooltipBorder: "rgba(35, 87, 160, 0.18)",
    tooltipBorderWidth: 0.5,
    tooltipRadius: 6,
    tooltipBlur: 7,
    tooltipTitle: "#173463",
    tooltipLabel: "#4c6788",
    tooltipValue: "#2357a0",
    crosshairVertical: "rgba(35, 87, 160, 0.18)",
    crosshairHorizontal: "rgba(35, 87, 160, 0.1)",
    selection: "rgba(35, 87, 160, 0.08)",
    selectionBorder: "#2357a0",
    selectionStyle: "solid",
    rangeOverlay: "rgba(64, 98, 140, 0.16)",
    rangeHandle: "#2357a0",
    rangeGrip: "#f8fbfd",
    rangeBorder: "#6a86ad",
    legend: "#31445d",
    legendSwatchSize: 13,
    marker: "diamond",
    markerSize: 5,
    markerBorder: "#ffffff",
    markerGlow: 12,
    markerGlowOpacity: 0.44,
    series: series(["#2357a0", "#6a86ad", "#c28b3c", "#1b7f93", "#56736c", "#8b6c5b"], 1.95),
    candles: {
      up: "#2357a0",
      down: "#c28b3c",
      wickUp: "#5b87c2",
      wickDown: "#d7aa62",
    },
    candleStrokeWidth: 1,
    previewLine: "#6a86ad",
  },
  {
    id: "arizona",
    label: "Arizona",
    colorScheme: "dark",
    background: gradient(["#0e0704", "#261410", "#4a2418", "#8c4428"], [0, 0.3, 0.65, 1]),
    grid: "rgba(196, 120, 68, 0.12)",
    gridWidth: 0.4,
    axis: "#c47844",
    axisLabel: "#d4a878",
    bottomTick: "rgba(196, 120, 68, 0.5)",
    leftAxisLabel: "#c4a080",
    rightAxisLabel: "#a89070",
    bottomCursor: "#3a1c10",
    rightCursor: "#e08850",
    bottomCursorText: "#f0d8c0",
    rightCursorText: "#140a06",
    tooltipBackground: "rgba(16, 8, 5, 0.84)",
    tooltipBorder: "rgba(196, 120, 68, 0.6)",
    tooltipBorderWidth: 1,
    tooltipRadius: 6,
    tooltipBlur: 6,
    tooltipTitle: "#f0d8c0",
    tooltipLabel: "#d4b498",
    tooltipValue: "#f8ece0",
    crosshairVertical: "rgba(224, 136, 80, 0.3)",
    crosshairHorizontal: "rgba(196, 120, 68, 0.14)",
    selection: "rgba(224, 136, 80, 0.1)",
    selectionBorder: "#e08850",
    selectionStyle: "solid",
    rangeOverlay: "rgba(12, 6, 3, 0.72)",
    rangeHandle: "#e08850",
    rangeGrip: "#1c0e08",
    rangeBorder: "#8c5030",
    legend: "#d8c0a8",
    marker: "triangle",
    markerSize: 6,
    markerBorder: "#f0dcc8",
    markerGlow: 12,
    markerGlowOpacity: 0.6,
    series: series(["#e08850", "#d4a060", "#8aaa72", "#c86040", "#f0c878", "#b09080"], 2.1, [
      "triangle",
      "diamond",
      "circle",
      "square",
      "x",
      "cross",
    ]),
    candles: {
      up: "#8aaa72",
      down: "#c86040",
      wickUp: "#a8c890",
      wickDown: "#e08060",
    },
    candleStrokeWidth: 1,
    previewLine: "#d4a060",
  },
  {
    id: "neon",
    label: "Neon",
    colorScheme: "dark",
    background: gradient(["#06030a", "#10061c", "#1a0c2e"]),
    grid: "rgba(192, 132, 252, 0.08)",
    gridWidth: 0.35,
    axis: "#8b5cf6",
    axisLabel: "#b898d0",
    bottomTick: "rgba(139, 92, 246, 0.45)",
    rightAxisLabel: "#a078c0",
    bottomCursor: "#1a0c2e",
    rightCursor: "#f472b6",
    bottomCursorText: "#e0c8f0",
    rightCursorText: "#0c0614",
    tooltipBackground: "rgba(8, 4, 14, 0.86)",
    tooltipBorder: "rgba(244, 114, 182, 0.45)",
    tooltipBorderWidth: 0.5,
    tooltipRadius: 6,
    tooltipBlur: 10,
    tooltipTitle: "#f0d0e8",
    tooltipLabel: "#c8a0d8",
    tooltipValue: "#f8e8f4",
    crosshairVertical: "rgba(244, 114, 182, 0.25)",
    crosshairHorizontal: "rgba(139, 92, 246, 0.12)",
    selection: "rgba(244, 114, 182, 0.08)",
    selectionBorder: "#f472b6",
    selectionStyle: "solid",
    rangeOverlay: "rgba(6, 3, 10, 0.75)",
    rangeHandle: "#c084fc",
    rangeGrip: "#0c0614",
    rangeBorder: "#6d28d9",
    legend: "#d0b0e0",
    marker: "diamond",
    markerSize: 5,
    markerBorder: "#f0d0e8",
    markerGlow: 16,
    markerGlowOpacity: 0.7,
    series: series(["#f472b6", "#c084fc", "#22d3ee", "#818cf8", "#fb923c", "#a78bfa"], 1.9),
    candles: {
      up: "#22d3ee",
      down: "#f472b6",
      wickUp: "#67e8f9",
      wickDown: "#f9a8d4",
    },
    candleStrokeWidth: 1,
    previewLine: "#c084fc",
  },
  {
    id: "shibuya",
    label: "Shibuya",
    colorScheme: "dark",
    background: gradient(["#030507", "#091018", "#12151d"]),
    grid: "rgba(123, 228, 255, 0.08)",
    gridWidth: 0.35,
    axis: "#3a4d58",
    axisLabel: "#9cb7c3",
    bottomTick: "rgba(123, 228, 255, 0.34)",
    leftAxisLabel: "#a9c1cb",
    rightAxisLabel: "#7ea0ad",
    bottomCursor: "#e8f1f5",
    rightCursor: "#ff5b6f",
    bottomCursorText: "#0a1218",
    rightCursorText: "#fff8fa",
    tooltipBackground: "rgba(8, 12, 17, 0.76)",
    tooltipBorder: "rgba(123, 228, 255, 0.34)",
    tooltipBorderWidth: 0.5,
    tooltipRadius: 6,
    tooltipBlur: 10,
    tooltipTitle: "#f2f8fb",
    tooltipLabel: "#9fb8c5",
    tooltipValue: "#f8fbfd",
    crosshairVertical: "rgba(123, 228, 255, 0.26)",
    crosshairHorizontal: "rgba(255, 91, 111, 0.12)",
    selection: "rgba(123, 228, 255, 0.08)",
    selectionBorder: "#7be4ff",
    selectionStyle: "solid",
    rangeOverlay: "rgba(3, 5, 8, 0.76)",
    rangeHandle: "#eaf4f8",
    rangeGrip: "#0a1218",
    rangeBorder: "#7be4ff",
    legend: "#cadbe2",
    marker: "diamond",
    markerSize: 5,
    markerBorder: "#f4f9fb",
    markerGlow: 16,
    markerGlowOpacity: 0.48,
    series: series(
      ["#7be4ff", "#f8fbff", "#ff5b6f", "#ffd166", "#39d98a", "#4da3ff"],
      [1.95, 1.9, 1.95, 1.9, 1.9, 1.9],
    ),
    candles: {
      up: "#7be4ff",
      down: "#ff5b6f",
      wickUp: "#b7f3ff",
      wickDown: "#ff9aa6",
    },
    candleStrokeWidth: 1,
    previewLine: "#f8fbff",
  },
  {
    id: "arcology",
    label: "Arcology",
    colorScheme: "dark",
    background: gradient(["#040506", "#0b0d0f", "#151110"]),
    grid: "rgba(214, 255, 74, 0.08)",
    gridWidth: 0.35,
    axis: "#3c4630",
    axisLabel: "#98a37b",
    bottomTick: "rgba(214, 255, 74, 0.34)",
    leftAxisLabel: "#a8b38d",
    rightAxisLabel: "#d7a25f",
    bottomCursor: "#d6ff4a",
    rightCursor: "#ff47b8",
    bottomCursorText: "#0a0d0f",
    rightCursorText: "#fff7fc",
    tooltipBackground: "rgba(7, 9, 10, 0.76)",
    tooltipBorder: "rgba(214, 255, 74, 0.28)",
    tooltipBorderWidth: 0.5,
    tooltipRadius: 6,
    tooltipBlur: 10,
    tooltipTitle: "#f3ffd6",
    tooltipLabel: "#aeb88d",
    tooltipValue: "#fff4df",
    crosshairVertical: "rgba(214, 255, 74, 0.25)",
    crosshairHorizontal: "rgba(255, 71, 184, 0.1)",
    selection: "rgba(214, 255, 74, 0.08)",
    selectionBorder: "#d6ff4a",
    selectionStyle: "solid",
    rangeOverlay: "rgba(4, 5, 6, 0.78)",
    rangeHandle: "#ffb84d",
    rangeGrip: "#0a0d0f",
    rangeBorder: "#d6ff4a",
    legend: "#cfd7b1",
    marker: "diamond",
    markerSize: 5,
    markerBorder: "#f8ffdf",
    markerGlow: 16,
    markerGlowOpacity: 0.48,
    series: series(
      ["#d6ff4a", "#ffb84d", "#ff47b8", "#62f0ff", "#f5f0d0", "#8f63ff"],
      [1.95, 1.9, 1.95, 1.9, 1.9, 1.9],
    ),
    candles: {
      up: "#d6ff4a",
      down: "#ff47b8",
      wickUp: "#ebff9a",
      wickDown: "#ff9ed8",
    },
    candleStrokeWidth: 1,
    previewLine: "#ffb84d",
  },
  {
    id: "riviera",
    label: "Riviera",
    colorScheme: "light",
    background: gradient(["#fffdf8", "#edf8fb", "#d3eaf1"]),
    grid: "rgba(75, 115, 128, 0.12)",
    gridWidth: 0.45,
    axis: "#6c92a0",
    axisLabel: "#46606b",
    bottomTick: "rgba(75, 115, 128, 0.34)",
    rightAxisLabel: "#0d8ba1",
    bottomCursor: "#153a4b",
    rightCursor: "#0d8ba1",
    bottomCursorText: "#fcfbf6",
    rightCursorText: "#fcfbf6",
    tooltipBackground: "rgba(255, 252, 245, 0.8)",
    tooltipBorder: "rgba(38, 82, 98, 0.18)",
    tooltipBorderWidth: 0.5,
    tooltipRadius: 6,
    tooltipBlur: 6,
    tooltipTitle: "#173847",
    tooltipLabel: "#59717a",
    tooltipValue: "#0d8ba1",
    crosshairVertical: "rgba(13, 139, 161, 0.16)",
    crosshairHorizontal: "rgba(75, 115, 128, 0.1)",
    selection: "rgba(13, 139, 161, 0.08)",
    selectionBorder: "#0d8ba1",
    selectionStyle: "solid",
    rangeOverlay: "rgba(108, 136, 146, 0.16)",
    rangeHandle: "#d2a85c",
    rangeGrip: "#fffdf8",
    rangeBorder: "#6c92a0",
    legend: "#2f4a56",
    legendSwatchSize: 13,
    marker: "diamond",
    markerSize: 5,
    markerBorder: "#ffffff",
    markerGlow: 12,
    markerGlowOpacity: 0.4,
    series: series(["#0d8ba1", "#2ca58d", "#d2a85c", "#5177a5", "#d67b59", "#6f8e5b"], 1.95),
    candles: {
      up: "#0d8ba1",
      down: "#d67b59",
      wickUp: "#49abbc",
      wickDown: "#e29a7e",
    },
    candleStrokeWidth: 1,
    previewLine: "#6c92a0",
  },
  {
    id: "bauhaus",
    label: "Bauhaus",
    colorScheme: "light",
    background: gradient(["#fffaf1", "#f2ebdf", "#e4d9c8"]),
    grid: "rgba(31, 35, 40, 0.12)",
    gridWidth: 0.45,
    axis: "#777067",
    axisLabel: "#37393c",
    bottomTick: "rgba(31, 35, 40, 0.34)",
    rightAxisLabel: "#1e5fa6",
    bottomCursor: "#262a2d",
    rightCursor: "#1e5fa6",
    bottomCursorText: "#fffaf1",
    rightCursorText: "#fffaf1",
    tooltipBackground: "rgba(255, 252, 245, 0.86)",
    tooltipBorder: "rgba(31, 35, 40, 0.22)",
    tooltipBorderWidth: 0.5,
    tooltipRadius: 2,
    tooltipBlur: 4,
    tooltipTitle: "#202327",
    tooltipLabel: "#55524c",
    tooltipValue: "#1e5fa6",
    crosshairVertical: "rgba(30, 95, 166, 0.2)",
    crosshairHorizontal: "rgba(207, 61, 50, 0.12)",
    selection: "rgba(30, 95, 166, 0.08)",
    selectionBorder: "#1e5fa6",
    selectionStyle: "solid",
    rangeOverlay: "rgba(47, 45, 41, 0.17)",
    rangeHandle: "#d69713",
    rangeGrip: "#fffaf1",
    rangeBorder: "#777067",
    legend: "#303236",
    legendSwatchSize: 13,
    marker: "square",
    markerSize: 5,
    markerBorder: "#fffdf8",
    markerGlow: 10,
    markerGlowOpacity: 0.34,
    series: series(["#1e5fa6", "#cf3d32", "#d69713", "#1b8069", "#6d4b96", "#27282a"], 1.95, [
      "square",
      "circle",
      "triangle",
      "diamond",
      "x",
      "cross",
    ]),
    candles: {
      up: "#1b8069",
      down: "#cf3d32",
      wickUp: "#3f9a85",
      wickDown: "#dc6b61",
    },
    candleStrokeWidth: 1,
    previewLine: "#1e5fa6",
  },
  {
    id: "washi",
    label: "Washi",
    colorScheme: "light",
    background: gradient(["#fffdf7", "#f4efe3", "#e7dcc8"]),
    grid: "rgba(67, 59, 49, 0.12)",
    gridWidth: 0.45,
    axis: "#827663",
    axisLabel: "#4f473c",
    bottomTick: "rgba(67, 59, 49, 0.34)",
    rightAxisLabel: "#315b78",
    bottomCursor: "#2f4050",
    rightCursor: "#b94834",
    bottomCursorText: "#fffdf7",
    rightCursorText: "#fffdf7",
    tooltipBackground: "rgba(255, 253, 247, 0.86)",
    tooltipBorder: "rgba(67, 59, 49, 0.2)",
    tooltipBorderWidth: 0.5,
    tooltipRadius: 4,
    tooltipBlur: 5,
    tooltipTitle: "#312e2a",
    tooltipLabel: "#5d554a",
    tooltipValue: "#315b78",
    crosshairVertical: "rgba(49, 91, 120, 0.18)",
    crosshairHorizontal: "rgba(185, 72, 52, 0.1)",
    selection: "rgba(49, 91, 120, 0.08)",
    selectionBorder: "#315b78",
    selectionStyle: "dashed",
    rangeOverlay: "rgba(86, 74, 58, 0.17)",
    rangeHandle: "#b94834",
    rangeGrip: "#fffdf7",
    rangeBorder: "#827663",
    legend: "#413b33",
    legendSwatchSize: 13,
    marker: "diamond",
    markerSize: 5,
    markerBorder: "#fffdf7",
    markerGlow: 10,
    markerGlowOpacity: 0.34,
    series: series(["#315b78", "#b94834", "#69804c", "#b07c2d", "#775c75", "#3f3b37"], 1.95),
    candles: {
      up: "#2e766b",
      down: "#b94834",
      wickUp: "#57978e",
      wickDown: "#d07261",
    },
    candleStrokeWidth: 1,
    previewLine: "#315b78",
  },
  {
    id: "botanica",
    label: "Botanica",
    colorScheme: "light",
    background: gradient(["#fbfaef", "#eff2df", "#dfe7ce"]),
    grid: "rgba(48, 78, 55, 0.12)",
    gridWidth: 0.45,
    axis: "#71806b",
    axisLabel: "#384c3d",
    bottomTick: "rgba(48, 78, 55, 0.34)",
    rightAxisLabel: "#2f7250",
    bottomCursor: "#314a39",
    rightCursor: "#2f7250",
    bottomCursorText: "#fbfaef",
    rightCursorText: "#fbfaef",
    tooltipBackground: "rgba(251, 250, 239, 0.86)",
    tooltipBorder: "rgba(48, 78, 55, 0.2)",
    tooltipBorderWidth: 0.5,
    tooltipRadius: 6,
    tooltipBlur: 5,
    tooltipTitle: "#26372b",
    tooltipLabel: "#536658",
    tooltipValue: "#2f7250",
    crosshairVertical: "rgba(47, 114, 80, 0.18)",
    crosshairHorizontal: "rgba(184, 126, 38, 0.1)",
    selection: "rgba(47, 114, 80, 0.08)",
    selectionBorder: "#2f7250",
    selectionStyle: "dotted",
    rangeOverlay: "rgba(74, 92, 65, 0.17)",
    rangeHandle: "#b87e26",
    rangeGrip: "#fbfaef",
    rangeBorder: "#71806b",
    legend: "#34473a",
    legendSwatchSize: 13,
    marker: "circle",
    markerSize: 5,
    markerBorder: "#fffef6",
    markerGlow: 10,
    markerGlowOpacity: 0.34,
    series: series(["#2f7d56", "#b87e26", "#4e7898", "#a44f5e", "#6d803a", "#765477"], 1.95),
    candles: {
      up: "#2f7d56",
      down: "#a44f5e",
      wickUp: "#57a078",
      wickDown: "#bf7480",
    },
    candleStrokeWidth: 1,
    previewLine: "#71806b",
  },
  {
    id: "newsprint",
    label: "Newsprint",
    colorScheme: "light",
    background: gradient(["#faf7ef", "#eee9de", "#dfd8ca"]),
    grid: "rgba(37, 42, 46, 0.13)",
    gridWidth: 0.45,
    axis: "#77736b",
    axisLabel: "#303438",
    bottomTick: "rgba(37, 42, 46, 0.36)",
    rightAxisLabel: "#1e64a1",
    bottomCursor: "#252a2e",
    rightCursor: "#c23f45",
    bottomCursorText: "#faf7ef",
    rightCursorText: "#fff8f2",
    tooltipBackground: "rgba(250, 247, 239, 0.88)",
    tooltipBorder: "rgba(37, 42, 46, 0.24)",
    tooltipBorderWidth: 0.5,
    tooltipRadius: 1,
    tooltipBlur: 3,
    tooltipTitle: "#202428",
    tooltipLabel: "#555550",
    tooltipValue: "#1e64a1",
    crosshairVertical: "rgba(30, 100, 161, 0.2)",
    crosshairHorizontal: "rgba(194, 63, 69, 0.12)",
    selection: "rgba(30, 100, 161, 0.08)",
    selectionBorder: "#1e64a1",
    selectionStyle: "dashed",
    rangeOverlay: "rgba(45, 47, 47, 0.18)",
    rangeHandle: "#20262b",
    rangeGrip: "#faf7ef",
    rangeBorder: "#77736b",
    legend: "#282c30",
    legendSwatchSize: 13,
    marker: "square",
    markerSize: 5,
    markerBorder: "#faf7ef",
    markerGlow: 9,
    markerGlowOpacity: 0.3,
    series: series(["#20262b", "#c23f45", "#1e64a1", "#c88a19", "#178177", "#73508d"], 1.95, [
      "square",
      "circle",
      "diamond",
      "triangle",
      "x",
      "cross",
    ]),
    candles: {
      up: "#1e64a1",
      down: "#c23f45",
      wickUp: "#4b82b3",
      wickDown: "#d66c71",
    },
    candleStrokeWidth: 1,
    previewLine: "#20262b",
  },
];

const ENGLISH_STOCK_FIELDS = {
  open: "Open",
  high: "High",
  low: "Low",
  close: "Close",
  change: "Change",
  changePercent: "Change %",
  volume: "Volume",
} as const;

interface SeriesMarkerGlow {
  color: string;
  blur: number;
  opacity: number;
}

// Per-series glows preserve each palette's intended contrast and depth.
const SERIES_MARKER_GLOWS = {
  default: [
    { color: "#e94e9b", blur: 14, opacity: 0.5 },
    { color: "#f37d24", blur: 12, opacity: 0.45 },
    { color: "#4389ee", blur: 12, opacity: 0.45 },
    { color: "#f04c50", blur: 12, opacity: 0.45 },
    { color: "#a660ed", blur: 12, opacity: 0.45 },
    { color: "#8f63eb", blur: 16, opacity: 0.55 },
  ],
  mainframe: [
    { color: "#00cc44", blur: 12, opacity: 0.55 },
    { color: "#0d5c1a", blur: 10, opacity: 0.5 },
    { color: "#30b848", blur: 12, opacity: 0.55 },
    { color: "#134d1e", blur: 10, opacity: 0.45 },
    { color: "#22dd55", blur: 12, opacity: 0.55 },
    { color: "#1a7a2a", blur: 12, opacity: 0.55 },
  ],
  blueprint: [
    { color: "#7ce7ff", blur: 14, opacity: 0.46 },
    { color: "#36c4ff", blur: 14, opacity: 0.44 },
    { color: "#94ffe1", blur: 14, opacity: 0.42 },
    { color: "#f4f7fb", blur: 14, opacity: 0.34 },
    { color: "#4f8bff", blur: 14, opacity: 0.42 },
    { color: "#ffcf7a", blur: 16, opacity: 0.42 },
  ],
  porcelain: [
    { color: "#5a9c9d", blur: 14, opacity: 0.42 },
    { color: "#6a7ea8", blur: 14, opacity: 0.4 },
    { color: "#d28f6d", blur: 14, opacity: 0.38 },
    { color: "#4c8194", blur: 14, opacity: 0.4 },
    { color: "#7e9e62", blur: 14, opacity: 0.36 },
    { color: "#7f6f8f", blur: 14, opacity: 0.34 },
  ],
  azulejo: [
    { color: "#2357a0", blur: 14, opacity: 0.44 },
    { color: "#6a86ad", blur: 14, opacity: 0.4 },
    { color: "#c28b3c", blur: 14, opacity: 0.36 },
    { color: "#1b7f93", blur: 14, opacity: 0.4 },
    { color: "#56736c", blur: 14, opacity: 0.34 },
    { color: "#8b6c5b", blur: 14, opacity: 0.32 },
  ],
  arizona: [
    { color: "#e08850", blur: 14, opacity: 0.5 },
    { color: "#d4a060", blur: 14, opacity: 0.45 },
    { color: "#8aaa72", blur: 14, opacity: 0.45 },
    { color: "#c86040", blur: 14, opacity: 0.48 },
    { color: "#f0c878", blur: 14, opacity: 0.4 },
    { color: "#b09080", blur: 12, opacity: 0.38 },
  ],
  neon: [
    { color: "#f472b6", blur: 18, opacity: 0.55 },
    { color: "#c084fc", blur: 16, opacity: 0.5 },
    { color: "#22d3ee", blur: 16, opacity: 0.48 },
    { color: "#818cf8", blur: 14, opacity: 0.45 },
    { color: "#fb923c", blur: 16, opacity: 0.5 },
    { color: "#a78bfa", blur: 14, opacity: 0.42 },
  ],
  shibuya: [
    { color: "#7be4ff", blur: 18, opacity: 0.52 },
    { color: "#f8fbff", blur: 14, opacity: 0.38 },
    { color: "#ff5b6f", blur: 16, opacity: 0.44 },
    { color: "#ffd166", blur: 14, opacity: 0.38 },
    { color: "#39d98a", blur: 14, opacity: 0.38 },
    { color: "#4da3ff", blur: 14, opacity: 0.38 },
  ],
  arcology: [
    { color: "#d6ff4a", blur: 18, opacity: 0.5 },
    { color: "#ffb84d", blur: 16, opacity: 0.42 },
    { color: "#ff47b8", blur: 16, opacity: 0.44 },
    { color: "#62f0ff", blur: 14, opacity: 0.38 },
    { color: "#f5f0d0", blur: 12, opacity: 0.28 },
    { color: "#8f63ff", blur: 14, opacity: 0.36 },
  ],
  riviera: [
    { color: "#0d8ba1", blur: 14, opacity: 0.42 },
    { color: "#2ca58d", blur: 14, opacity: 0.4 },
    { color: "#d2a85c", blur: 14, opacity: 0.38 },
    { color: "#5177a5", blur: 14, opacity: 0.38 },
    { color: "#d67b59", blur: 14, opacity: 0.34 },
    { color: "#6f8e5b", blur: 14, opacity: 0.32 },
  ],
  bauhaus: [
    { color: "#1e5fa6", blur: 12, opacity: 0.38 },
    { color: "#cf3d32", blur: 12, opacity: 0.36 },
    { color: "#d69713", blur: 12, opacity: 0.34 },
    { color: "#1b8069", blur: 12, opacity: 0.36 },
    { color: "#6d4b96", blur: 12, opacity: 0.34 },
    { color: "#27282a", blur: 10, opacity: 0.26 },
  ],
  washi: [
    { color: "#315b78", blur: 12, opacity: 0.36 },
    { color: "#b94834", blur: 12, opacity: 0.34 },
    { color: "#69804c", blur: 12, opacity: 0.32 },
    { color: "#b07c2d", blur: 12, opacity: 0.32 },
    { color: "#775c75", blur: 12, opacity: 0.3 },
    { color: "#3f3b37", blur: 10, opacity: 0.24 },
  ],
  botanica: [
    { color: "#2f7d56", blur: 12, opacity: 0.36 },
    { color: "#b87e26", blur: 12, opacity: 0.32 },
    { color: "#4e7898", blur: 12, opacity: 0.32 },
    { color: "#a44f5e", blur: 12, opacity: 0.32 },
    { color: "#6d803a", blur: 12, opacity: 0.3 },
    { color: "#765477", blur: 12, opacity: 0.28 },
  ],
  newsprint: [
    { color: "#20262b", blur: 10, opacity: 0.24 },
    { color: "#c23f45", blur: 12, opacity: 0.34 },
    { color: "#1e64a1", blur: 12, opacity: 0.36 },
    { color: "#c88a19", blur: 12, opacity: 0.3 },
    { color: "#178177", blur: 12, opacity: 0.32 },
    { color: "#73508d", blur: 12, opacity: 0.3 },
  ],
} as const satisfies Record<ChartThemeId, readonly SeriesMarkerGlow[]>;

function makeAppearance(palette: ThemePalette): {
  line: DeepPartial<LineAppearanceOptions>;
  stock: DeepPartial<StockAppearanceOptions>;
} {
  const axisColors = {
    color: palette.axis,
    bottom: {
      labelFont: { color: palette.axisLabel, family: DEFAULT_CHART_FONT_FAMILY },
      cursorLabel: {
        backgroundColor: palette.bottomCursor,
        labelFont: {
          color: palette.bottomCursorText,
          family: DEFAULT_CHART_FONT_FAMILY,
        },
      },
    },
    left: {
      labelFont: {
        color: palette.leftAxisLabel ?? palette.axisLabel,
        family: DEFAULT_CHART_FONT_FAMILY,
      },
    },
    right: {
      labelFont: {
        color: palette.rightAxisLabel,
        family: DEFAULT_CHART_FONT_FAMILY,
      },
      cursorLabel: {
        backgroundColor: palette.rightCursor,
        labelFont: {
          color: palette.rightCursorText,
          family: DEFAULT_CHART_FONT_FAMILY,
        },
      },
    },
  };

  const tooltipColors = {
    backgroundColor: palette.tooltipBackground,
    borderColor: palette.tooltipBorder,
    borderWidth: palette.tooltipBorderWidth,
    borderRadius: palette.tooltipRadius,
    backdropBlur: palette.tooltipBlur,
    titleFont: {
      color: palette.tooltipTitle,
      family: DEFAULT_CHART_FONT_FAMILY,
    },
    labelFont: {
      color: palette.tooltipLabel,
      family: DEFAULT_CHART_FONT_FAMILY,
    },
    valueFont: {
      color: palette.tooltipValue,
      family: DEFAULT_CHART_FONT_FAMILY,
    },
  };

  const shared = {
    chartBackground: palette.background,
    grid: { color: palette.grid, lineWidth: palette.gridWidth },
    crosshairStyle: {
      vertical: { color: palette.crosshairVertical },
      horizontal: { color: palette.crosshairHorizontal },
    },
  };

  const line: DeepPartial<LineAppearanceOptions> = {
    ...shared,
    padding: { top: 0, left: 60, right: 60, bottom: 16 },
    axis: {
      ...axisColors,
      bottom: {
        ...axisColors.bottom,
        labelFont: { ...axisColors.bottom.labelFont, size: 12 },
        cursorLabel: {
          ...axisColors.bottom.cursorLabel,
          visible: true,
        },
        ticks: {
          length: 5,
          color: palette.bottomTick ?? palette.axis,
          width: 1,
        },
      },
      left: {
        labelFont: { ...axisColors.left.labelFont, size: 12 },
      },
      right: {
        ...axisColors.right,
        labelFont: { ...axisColors.right.labelFont, size: 12 },
        cursorLabel: {
          ...axisColors.right.cursorLabel,
          visible: true,
        },
      },
    },
    tooltip: {
      ...tooltipColors,
      position: "cursor",
      titleFont: { ...tooltipColors.titleFont, size: 12, weight: "600" },
      labelFont: { ...tooltipColors.labelFont, size: 12 },
      valueFont: { ...tooltipColors.valueFont, size: 12, weight: "600" },
    },
    legend: {
      visible: true,
      position: "bottom",
      layout: "row",
      align: "center",
      interactive: true,
      allowHideAll: false,
      padding: { top: 0, right: 0, bottom: 24, left: 0 },
      itemGap: 18,
      inactiveOpacity: 0.35,
      swatch: { shape: "line", size: palette.legendSwatchSize ?? 12 },
      labelFont: {
        size: 12,
        weight: 600,
        color: palette.legend,
        width: 110,
        family: DEFAULT_CHART_FONT_FAMILY,
      },
    },
    selection: {
      color: palette.selection,
      borderColor: palette.selectionBorder,
      borderWidth: 0.5,
      borderStyle: palette.selectionStyle ?? "solid",
    },
    rangeSelector: {
      effect: "glass",
      borderRadius: 6,
      overlayColor: palette.rangeOverlay,
      handleColor: palette.rangeHandle,
      gripColor: palette.rangeGrip,
      borderColor: palette.rangeBorder,
    },
    marker: {
      shape: palette.marker,
      size: palette.markerSize,
      borderColor: palette.markerBorder,
      borderWidth: 1,
      glow: {
        blur: palette.markerGlow,
        opacity: palette.markerGlowOpacity,
      },
    },
  };

  const usesDefaultStockBase = palette.id === "default";
  const stockTooltip = {
    ...tooltipColors,
    backgroundColor: usesDefaultStockBase ? "rgba(0, 0, 0, 0.54)" : palette.tooltipBackground,
    titleFormat: "time" as const,
    fieldLabels: ENGLISH_STOCK_FIELDS,
    padding: { top: 10, right: 14, bottom: 10, left: 14 },
    position: "cursor" as const,
    backdropBlur: usesDefaultStockBase ? 6 : palette.tooltipBlur,
    titleFont: { ...tooltipColors.titleFont, size: 12, weight: "600" },
    labelFont: { ...tooltipColors.labelFont, size: 12 },
    valueFont: { ...tooltipColors.valueFont, size: 12, weight: "600" },
  };

  const stock: DeepPartial<StockAppearanceOptions> = {
    ...shared,
    axis: {
      ...axisColors,
      bottom: {
        ...axisColors.bottom,
        format: "time",
        labelFont: { ...axisColors.bottom.labelFont, size: 12 },
      },
      left: {
        labelFont: { ...axisColors.left.labelFont, size: 12 },
      },
      right: {
        ...axisColors.right,
        labelFont: { ...axisColors.right.labelFont, size: 12 },
      },
    },
    tooltip: stockTooltip,
    selection: usesDefaultStockBase
      ? {
          color: "rgba(78, 204, 163, 0.15)",
          borderColor: "#4ecca3",
          borderWidth: 1,
          borderStyle: "dotted",
        }
      : {
          color: palette.selection,
          borderColor: palette.selectionBorder,
          borderWidth: 1,
          borderStyle: palette.selectionStyle ?? "solid",
        },
    rangeSelector: {
      overlayColor: palette.rangeOverlay,
      handleColor: palette.rangeHandle,
      gripColor: palette.rangeGrip,
      borderColor: palette.rangeBorder,
    },
    candleColors: palette.candles,
    candleStrokeWidth: palette.candleStrokeWidth,
    previewLineColor: palette.previewLine,
  };

  return { line, stock };
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

function makePreset(palette: ThemePalette): ChartThemePreset {
  const appearances = makeAppearance(palette);
  const markerGlows = SERIES_MARKER_GLOWS[palette.id];
  if (markerGlows.length !== palette.series.length) {
    throw new Error(`Theme ${palette.id} has incomplete series marker styling`);
  }
  const preset = {
    id: palette.id,
    label: palette.label,
    colorScheme: palette.colorScheme,
    line: {
      appearance: appearances.line,
      series: palette.series.map((entry, index) => {
        const glow = markerGlows[index];
        if (!glow) {
          throw new Error(`Theme ${palette.id} is missing marker style ${index}`);
        }
        return {
          color: entry.color,
          width: entry.width,
          marker: {
            shape: entry.marker,
            glow: { ...glow },
          },
        };
      }),
    },
    stock: { appearance: appearances.stock },
  };
  deepFreeze(preset);
  return preset as unknown as ChartThemePreset;
}

// Compile-time public contract checks. The conditional annotation on `catalog`
// becomes `never` if nested readonly guarantees or direct chart API
// compatibility regress, while emitting no additional JavaScript.
type TypesEqual<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type IsReadonlyKey<Value, Key extends keyof Value> =
  TypesEqual<Pick<Value, Key>, { -readonly [Property in Key]: Value[Property] }> extends true
    ? false
    : true;
type ThemeGridAppearance = NonNullable<ChartThemePreset["line"]["appearance"]["grid"]>;
type ThemePresetContractChecks = [
  IsReadonlyKey<ChartThemePreset["line"], "appearance">,
  IsReadonlyKey<ThemeGridAppearance, "color">,
  TypesEqual<ChartThemePreset["line"]["series"] extends unknown[] ? true : false, false>,
  ChartThemePreset["line"]["appearance"] extends Parameters<LineChart["updateAppearance"]>[0]
    ? true
    : false,
  ChartThemePreset["line"]["series"][number] extends Parameters<
    LineChart["updateSeriesAppearance"]
  >[1]
    ? true
    : false,
  ChartThemePreset["stock"]["appearance"] extends Parameters<StockChart["updateAppearance"]>[0]
    ? true
    : false,
];
type ThemePresetContractIsSound = ThemePresetContractChecks[number] extends true ? true : false;

const catalog: ThemePresetContractIsSound extends true ? readonly ChartThemePreset[] : never =
  palettes.map(makePreset);

/** Immutable presets keyed by their stable public identifiers. */
export const PUBLIC_THEMES = deepFreeze(
  Object.fromEntries(catalog.map((preset) => [preset.id, preset])),
) as Readonly<Record<ChartThemeId, ChartThemePreset>>;

/** Return an immutable public preset, throwing for an unknown runtime value. */
export function getThemePreset(id: ChartThemeId): ChartThemePreset {
  const preset = PUBLIC_THEMES[id];
  if (!preset) throw new RangeError(`Unknown Sixtyfold chart theme: ${String(id)}`);
  return preset;
}
