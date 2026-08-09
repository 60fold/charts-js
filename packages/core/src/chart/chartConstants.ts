// Shared constants for chart components
import { POINTER_INTERACTION } from "./pointerInteractionConstants.js";

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

// =============================================================================
// Animation Constants
// =============================================================================

export const ANIMATION = {
  // Viewport animation (pan/zoom)
  viewportDuration: 150, // ms - duration for pan/zoom animations
  viewportResetDuration: 300, // ms - duration for reset/setRange animations
  viewportEasing: easeOutCubic,

  // Y-axis animation
  yAxisDuration: 200, // ms - duration for Y-axis rescaling
  yAxisEasing: easeOutCubic,

  // Reveal animation (initial data load)
  revealDuration: 600, // ms - duration for initial data reveal
  revealEasing: easeOutCubic,

  // Grid fade animation
  gridFadeSpeed: 0.1, // alpha change per frame (0-1 scale)
};

// =============================================================================
// Layout Constants
// =============================================================================

export const PADDING = {
  top: 20,
  right: 80,
  bottom: 40,
  left: 80,
};

export const RANGE_HEIGHT = 60;
export const RANGE_HANDLE_WIDTH = 8;

/** Default Canvas2D font stack shared by every chart text surface. */
export const DEFAULT_CHART_FONT_FAMILY =
  "'SFMono-Regular', 'Roboto Mono', 'Cascadia Mono', 'Liberation Mono', monospace";

// Debounce window (ms) for ignoring synthetic mouse events fired after touch.
// Shared by every pointer interaction handler so they stay in sync.
export const TOUCH_DEBOUNCE_MS = POINTER_INTERACTION.touchDebounceMs;

// Pre-defined dash patterns (avoid GC churn during animation)
export const DASH_PATTERNS = {
  solid: [] as number[],
  dashed: [5, 3],
  dotted: [2, 2],
} as const;

export const COLORS = {
  background: "#16213e",
  grid: "#2d4a7c",
  gridText: "#6b8cae",
  axes: "#4a6fa1",
  rangeOverlay: "rgba(0, 0, 0, 0.6)",
  rangeBorder: "#4a6fa1",
  selection: "rgba(78, 204, 163, 0.2)",
  selectionBorder: "#4ecca3",
};

export const DEFAULT_CURSOR_LABEL_COLOR = "#1b55f4";

export const CANDLE_COLORS = {
  up: "#26a69a",
  down: "#ef5350",
  wickUp: "#26a69a",
  wickDown: "#ef5350",
};

// Time constants
export const HOUR = 3600000;

// Minimum viewport range per chart type (shared between main thread and renderer)
export const LINE_MIN_RANGE = 10;
export const STOCK_MIN_RANGE = HOUR;
