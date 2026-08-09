// BaseChart - shared functionality for chart components

import { PADDING, RANGE_HEIGHT, TOUCH_DEBOUNCE_MS } from "./chartConstants.js";
import { selectRenderer, type ChartWorkerLike, type RendererFactory } from "./workerInterface.js";
import {
  markViewportInputBatchRenderer,
  supportsViewportInputBatch,
} from "./internalRendererCapabilities.js";
import { DeferredRenderer } from "./DeferredRenderer.js";
import type { EngineFactory } from "./MainThreadRenderer.js";
import {
  setupKeyboardEvents,
  type KeyboardChartAction,
  type KeyboardViewportAction,
} from "./keyboardEvents.js";
import { resolveRendererLayoutSync } from "./layoutSync.js";
import {
  setupPointerPanSelectEvents,
  type PointerPanSelectController,
} from "./pointerPanSelectEvents.js";
import { setupRangeSelectorEvents as attachRangeSelectorEvents } from "./rangeSelectorEvents.js";
import {
  deepClone,
  deepMerge,
  isPlainObject,
  type DeepPartial,
  type DeepReadonly,
} from "./chartStateUtils.js";
import {
  resolveMinViewportRange,
  type TimeFormatOptions,
  resolveYDomain,
  type YDomainOptions,
} from "./chartUtils.js";
import {
  closeOwnedOverlayImageSources,
  overlayNeedsAsyncResolution,
  prepareOverlayForInit,
  snapshotOverlay,
  type OverlayImageFailure,
} from "./chartOverlayRuntime.js";
import type { UnitOptions, FontStyle, TextDirection, TextAlign } from "../types/units.js";
import type { BackgroundOptions, CrosshairOptions } from "../types/chart.js";
import type {
  TooltipRenderParams,
  TooltipRenderResult,
  StockTooltipField,
} from "../types/tooltip.js";

/**
 * Ordered viewport inputs collected during one browser frame. Keep this
 * transport detail private: it is not part of the public worker interface.
 */
type ViewportInputCommand =
  { type: "pan"; dx: number } | { type: "zoom"; factor: number; centerX: number };

// Re-export for convenience
export type { UnitOptions, FontStyle, TextDirection, TextAlign, TimeFormatOptions, YDomainOptions };
export type {
  GradientOptions,
  ImageOptions,
  BackgroundOptions,
  CrosshairLineStyle,
  CrosshairOptions,
} from "../types/chart.js";
export type {
  TooltipRenderParams,
  TooltipRenderResult,
  StockTooltipRenderParams,
  StockTooltipRenderResult,
  StockTooltipField,
} from "../types/tooltip.js";
export { deepMerge } from "./chartStateUtils.js";
export type { DeepPartial, DeepReadonly } from "./chartStateUtils.js";

// Interaction timing constants (ms)
const DOUBLE_TAP_MS = 300; // Max time between taps for double-tap
const TOOLTIP_SHOW_DELAY_MS = 100; // Delay before showing tooltip on touch
const TOOLTIP_HIDE_DELAY_MS = 1500; // Delay before hiding tooltip after touch end

// Interaction threshold constants
const SELECTION_MIN_THRESHOLD = 0.001; // Min selection size as fraction of visible range
const PINCH_DEAD_ZONE = 0.05; // Ignore pinch scale changes below this threshold

// Speed option bounds. Zoom speeds must stay below 1 so the zoom-in factor
// (1 - speed) remains positive; pan speed is capped at one viewport per step.
const MAX_ZOOM_SPEED = 0.95;
const MAX_PAN_SPEED = 1;
const KEYBOARD_VIEWPORT_ANNOUNCEMENT_EXPIRY_MS = 1000;
const RENDERER_INITIALIZATION_TIMEOUT_MS = 15_000;

const DEFAULT_KEYBOARD_ANNOUNCEMENTS = {
  panLeft: "Chart panned left.",
  panRight: "Chart panned right.",
  zoomIn: "Chart zoomed in.",
  zoomOut: "Chart zoomed out.",
  reset: "Chart view reset.",
  selectionCancelled: "Chart selection cancelled.",
  viewport: "Showing {spanPercent}% of the available range, from {startPercent}% to {endPercent}%.",
} as const;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Clamp a user-provided speed option to [0, max]; non-finite values fall back to the default. */
function sanitizeSpeed(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, 0), max);
}

function resolveRendererInitializationTimeout(value: number | undefined): number {
  if (value === 0) return 0;
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return RENDERER_INITIALIZATION_TIMEOUT_MS;
  }
  return Math.max(1, Math.round(value));
}

/** Grid line customization */
export interface GridOptions {
  /** Grid line color (default: #2d4a7c) */
  color?: string;
  /** Grid line width (default: 0.5) */
  lineWidth?: number;
  /** Show vertical grid lines (default: true) */
  vertical?: boolean;
  /** Show horizontal grid lines (default: true) */
  horizontal?: boolean;
}

/** X-axis format options */
export type XAxisFormat =
  | "time" // Format as date/time (default for timestamps)
  | "number" // Format as plain number
  | TimeFormatOptions // Localized date/time formatting
  | UnitOptions; // Custom formatting with unit config

/** Cursor label style (floating label that follows cursor on Y-axis) */
export interface AxisCursorLabel {
  /** Whether to show the cursor label (default: false) */
  visible?: boolean;
  /** Background color (default: '#1b55f4') */
  backgroundColor?: string;
  /** Font style for cursor label text (default: 11px `DEFAULT_CHART_FONT_FAMILY`, #ffffff) */
  labelFont?: FontStyle;
  /**
   * Unit config for formatting the value.
   * - UnitOptions object: use specified formatting
   * - null: disable unit formatting (use default decimal format)
   * - "auto": auto-default from first series unit (default behavior)
   */
  unit?: UnitOptions | null | "auto";
}

/** Axis tick mark customization */
export interface AxisTicksOptions {
  /** Tick color (default: axis color) */
  color?: string;
  /** Tick width in pixels (default: 1) */
  width?: number;
  /** Tick length in pixels measured outward from axis line (default: 0 = hidden) */
  length?: number;
}

/** Axis configuration (generic over the format type) */
export interface AxisCommonOptions<TFormat> {
  /** Whether this axis is visible */
  visible?: boolean;
  /** Axis line width in pixels (default: 1). Set to 0 to hide line but keep labels/cursor label. */
  width?: number;
  /** Tick mark settings (default: hidden because `length` defaults to 0) */
  ticks?: AxisTicksOptions;
  /** Value format for tick labels */
  format?: TFormat;
  /** Font style for axis tick labels */
  labelFont?: FontStyle;
  /** Cursor label that follows mouse on this axis */
  cursorLabel?: AxisCursorLabel;
}

/** X-axis configuration (used for both bottom and top axes) */
export type XAxisOptions = AxisCommonOptions<XAxisFormat>;

/** Y-axis (left or right) configuration */
export type YAxisOptions = AxisCommonOptions<UnitOptions>;

/** Axis customization */
export interface AxisOptions {
  /** Axis line color (default: #4a6fa1) */
  color?: string;
  /** Default axis line width for all axes in pixels (default: 1). Per-axis `width` overrides this. */
  width?: number;
  /** Bottom X-axis configuration (default: visible) */
  bottom?: XAxisOptions;
  /** Top X-axis configuration (default: hidden) */
  top?: XAxisOptions;
  /** Left Y-axis configuration */
  left?: YAxisOptions;
  /** Right Y-axis configuration */
  right?: YAxisOptions;
}

/** Tooltip (crosshair info box) style customization */
export interface TooltipShadowOptions {
  /** Enable tooltip shadow (default: true when `shadow` object is provided) */
  enabled?: boolean;
  /** Shadow color (default: 'rgba(0, 0, 0, 0.18)') */
  color?: string;
  /** Blur radius in px (default: 8) */
  blur?: number;
  /** Horizontal shadow offset in px (default: 0) */
  offsetX?: number;
  /** Vertical shadow offset in px (default: 2) */
  offsetY?: number;
}

export interface TooltipOptions {
  /** Background color with transparency (default: 'rgba(22, 33, 62, 0.95)') */
  backgroundColor?: string;
  /** Border color (default: '#4a6fa1') */
  borderColor?: string;
  /** Border width in pixels (default: 1) */
  borderWidth?: number;
  /** Border radius in pixels (default: 0) */
  borderRadius?: number;
  /** Border style (default: 'solid') */
  borderStyle?: "solid" | "dashed" | "dotted";
  /** Tooltip position (default: 'cursor-top')
   *  - 'cursor-top'/'cursor-bottom': horizontally follows crosshair, pinned to top/bottom edge
   *  - 'cursor': follows mouse position
   *  - 'top-left'/'top-right'/'bottom-left'/'bottom-right': fixed in corner */
  position?:
    | "cursor-top"
    | "cursor-bottom"
    | "cursor"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right";
  /** Custom render callback for tooltip content (called on main thread) */
  onRender?: (params: TooltipRenderParams) => TooltipRenderResult;
  /** Font style for the tooltip title line */
  titleFont?: FontStyle;
  /** Font style for row labels (series names) */
  labelFont?: FontStyle;
  /** Font style for row values. When color is omitted, each value uses its row/series color. */
  valueFont?: FontStyle;
  /** Text direction for tooltip text. Defaults to the chart-level textDirection. */
  direction?: TextDirection;
  /** Show color swatch next to each series label (default: true) */
  showSwatch?: boolean;
  /** Called when mouse leaves the chart area (useful for hiding custom HTML tooltips) */
  onLeave?: () => void;
  /** Stock chart: use candle color (green/red) for tooltip border (default: false) */
  candleBorder?: boolean;
  /** Stock chart: which fields to show and in what order.
   *  Default: ['open', 'high', 'low', 'close', 'change', 'changePercent', 'volume'] */
  fields?: StockTooltipField[];
  /** Stock chart: display labels for built-in tooltip fields. Defaults to blank labels. */
  fieldLabels?: Partial<Record<StockTooltipField, string>>;
  /** Line chart: which series indices to show in tooltip (default: all series).
   *  Controls both visibility and order. E.g. [0, 2] shows only series 0 and 2. */
  visibleSeries?: number[];
  /** Format for the tooltip title (X-axis value).
   *  - 'time': format as date/time
   *  - 'number': format as plain number
   *  - UnitOptions: custom formatting with prefix/suffix/decimals
   *  Default: auto-detect from data (values > 1e9 → time, otherwise number).
   *  Note: auto-detection is heuristic and can classify large non-time values as time.
   *  Use explicit `titleFormat` when X values are large numeric quantities. */
  titleFormat?: XAxisFormat;
  /** Inner padding in pixels (default: 8 on all sides) */
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Backdrop blur radius in pixels (default: 0 = disabled) */
  backdropBlur?: number;
  /** Drop shadow around tooltip box (default: disabled) */
  shadow?: boolean | TooltipShadowOptions;
  /** Fixed tooltip width in pixels.
   *  - Exact: the box is always this width, regardless of content
   *  - No auto-fit: content that exceeds this width will overflow/clip
   *  - When omitted: the tooltip auto-sizes with a ratchet that prevents
   *    shrinking during a hover session */
  width?: number;
}

/** Selection range (drag-to-zoom) styling */
export interface SelectionOptions {
  /** Fill color of the selection rectangle (default: 'rgba(78, 204, 163, 0.2)') */
  color?: string;
  /** Border color of the selection edges (default: '#4ecca3') */
  borderColor?: string;
  /** Border width in pixels (default: 2) */
  borderWidth?: number;
  /** Border line style (default: 'dashed') */
  borderStyle?: "solid" | "dashed" | "dotted";
}

/** Range selector (preview) configuration */
export interface RangeSelectorOptions {
  /** Whether the range selector is visible (default: true) */
  visible?: boolean;
  /** Horizontal preview span: the padded plot width or the full canvas width (default: 'plot') */
  width?: "plot" | "canvas";
  /** Position of range selector (default: 'bottom') */
  position?: "top" | "bottom";
  /** Height of the preview area in pixels (default: 60) */
  height?: number;
  /** Gap between main chart and range selector in pixels (default: 0) */
  gap?: number;
  /** Visual effect for the selected range (default: 'none') */
  effect?: "none" | "glass";
  /** Border radius of the preview area in CSS pixels (default: 4) */
  borderRadius?: number;
  /** Overlay color for non-selected regions (default: 'rgba(0,0,0,0.6)') */
  overlayColor?: string;
  /** Handle bar color (default: '#4a90d9') */
  handleColor?: string;
  /** Handle grip lines color (default: '#fff') */
  gripColor?: string;
  /** Border radius of handle outer corners (default: 2) */
  handleBorderRadius?: number;
  /** Selection border color (default: '#4a6fa1') */
  borderColor?: string;
}

/** Chart padding in pixels */
export interface PaddingOptions {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/** Base configuration shared by all chart labels */
interface ChartLabelBase {
  /** The text to display */
  text: string;
  /** Font style (size, weight, color, family) */
  font?: FontStyle;
  /** Text direction for this label. Defaults to chart-level textDirection. */
  direction?: TextDirection;
  /** Padding around the label text in pixels (default: { top: 6, right: 6, bottom: 6, left: 6 }) */
  padding?: PaddingOptions;
}

/** Label for top or bottom position (horizontal alignment) */
export interface HorizontalChartLabel extends ChartLabelBase {
  /** Horizontal alignment (default: 'center') */
  align?: TextAlign;
}

/** Label for left or right position (vertical alignment) */
export interface VerticalChartLabel extends ChartLabelBase {
  /** Vertical alignment (default: 'middle') */
  align?: "top" | "middle" | "bottom";
}

/** Free-form label placed at arbitrary coordinates */
export interface CustomChartLabel {
  text: string;
  /** Values in [0,1] = fraction of area; outside that range = pixels */
  x: number;
  y: number;
  font?: FontStyle;
  /** Horizontal text alignment (default: 'left') */
  align?: TextAlign;
  /** Vertical text baseline (default: 'top') */
  baseline?: "top" | "middle" | "bottom";
  /** Text direction for this label. Defaults to chart-level textDirection. */
  direction?: TextDirection;
  /** Rotation in degrees, positive = clockwise (default: 0) */
  rotate?: number;
  /** 'chart' = relative to chart area (default), 'canvas' = relative to full canvas */
  relativeTo?: "chart" | "canvas";
}

/** Text labels around the chart area */
export interface ChartLabels {
  /** Title label above the chart */
  top?: HorizontalChartLabel;
  /** Label below the chart (below x-axis labels) */
  bottom?: HorizontalChartLabel;
  /** Vertical label on the left side (rotated 90 degrees CCW) */
  left?: VerticalChartLabel;
  /** Vertical label on the right side (rotated 90 degrees CW) */
  right?: VerticalChartLabel;
  /** Free-form overlay labels in a dense array of objects. */
  custom?: CustomChartLabel[];
}

function assertValidChartLabels(labels: unknown): void {
  if (labels === undefined) return;
  const candidate = labels as Partial<ChartLabels>;
  const custom = isPlainObject(labels) ? (candidate.custom ?? []) : null;
  if (
    !Array.isArray(custom) ||
    custom.length !== custom.filter(isPlainObject).length ||
    [candidate.top, candidate.bottom, candidate.left, candidate.right].some(
      (label) => label !== undefined && !isPlainObject(label),
    )
  ) {
    throw new TypeError("Invalid labels");
  }
}

function hasOwn(value: object, property: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, property);
}

/** Coordinate unit for overlay primitives */
export type OverlayCoordUnit = "ratio" | "px";

/** Overlay anchoring area */
export type OverlayRelativeTo = "chart" | "canvas";

/** Horizontal coordinate anchor edge */
export type OverlayXAnchor = "left" | "right";

/** Vertical coordinate anchor edge */
export type OverlayYAnchor = "top" | "bottom";

/** Common style for overlay stroke */
export interface OverlayStrokeStyle {
  color?: string;
  width?: number;
  dash?: number[];
}

/** Common style for overlay fill */
export interface OverlayFillStyle {
  color?: string;
}

/** Common base for overlay primitives */
interface OverlayItemBase {
  id?: string;
  visible?: boolean;
  z?: number;
  opacity?: number;
  x: number;
  y: number;
  xUnit?: OverlayCoordUnit;
  yUnit?: OverlayCoordUnit;
  /** Anchor edge for x: "left" (default) or "right" */
  xAnchor?: OverlayXAnchor;
  /** Anchor edge for y: "top" (default) or "bottom" */
  yAnchor?: OverlayYAnchor;
  relativeTo?: OverlayRelativeTo;
  rotate?: number;
}

/** Overlay text primitive */
export interface OverlayTextItem extends OverlayItemBase {
  kind?: "text";
  text: string;
  font?: FontStyle;
  color?: string;
  align?: TextAlign;
  baseline?: "top" | "middle" | "bottom";
  direction?: TextDirection;
  maxWidth?: number;
}

/** Overlay rectangle primitive */
export interface OverlayRectItem extends OverlayItemBase {
  kind: "rect";
  width: number;
  height: number;
  radius?: number;
  fill?: OverlayFillStyle;
  stroke?: OverlayStrokeStyle;
}

/** Overlay circle primitive */
export interface OverlayCircleItem extends OverlayItemBase {
  kind: "circle";
  radius: number;
  fill?: OverlayFillStyle;
  stroke?: OverlayStrokeStyle;
}

/** Overlay line primitive */
export interface OverlayLineItem extends OverlayItemBase {
  kind: "line";
  x2: number;
  y2: number;
  x2Unit?: OverlayCoordUnit;
  y2Unit?: OverlayCoordUnit;
  x2Anchor?: OverlayXAnchor;
  y2Anchor?: OverlayYAnchor;
  stroke?: OverlayStrokeStyle;
}

/** Overlay image primitive */
export interface OverlayImageItem extends OverlayItemBase {
  kind: "image";
  /**
   * Image source: data URL / URL string, ImageBitmap, or another CanvasImageSource.
   * The caller retains ownership of supplied sources. ImageBitmap values are
   * structured-cloned in worker and main-thread modes. An eager-only construction
   * overlay is safe to release after initialize() fulfills. If any sibling source
   * requires asynchronous resolution, keep the handle open until the overlay is
   * replaced or destroyed, or await setOverlay() after initialization before
   * closing it. Eager runtime sources may be closed after updateAppearance() (or
   * its containing batch) returns, including while initialization is pending. For
   * mixed/deferred runtime overlays, call setOverlay() directly and keep handles
   * open until its promise settles.
   */
  src: string | ImageBitmap | CanvasImageSource;
  width: number;
  height: number;
  fit?: "fill" | "contain" | "cover";
}

/** Any overlay primitive item */
export type OverlayItem =
  OverlayTextItem | OverlayRectItem | OverlayCircleItem | OverlayLineItem | OverlayImageItem;

/** Overlay primitives rendered on top of chart content */
export interface OverlayOptions {
  items: OverlayItem[];
}

/** Localizable announcements emitted after keyboard chart actions. */
export interface KeyboardAnnouncementMessages {
  panLeft?: string;
  panRight?: string;
  zoomIn?: string;
  zoomOut?: string;
  reset?: string;
  selectionCancelled?: string;
  /**
   * Optional viewport context appended after a successful pan, zoom, or reset.
   * The placeholders `{startPercent}`, `{endPercent}`, and `{spanPercent}` are
   * replaced with positions relative to the complete data range. Set an empty
   * string to announce only the action message.
   */
  viewport?: string;
}

export interface BaseChartOptions {
  /** Custom padding in pixels (default: { top: 20, right: 80, bottom: 40, left: 80 }) */
  padding?: PaddingOptions;
  /**
   * Animate data reveal and viewport/axis transitions.
   * When omitted, animation is enabled unless the browser reports
   * `prefers-reduced-motion: reduce`.
   */
  animated?: boolean;
  /**
   * Keep-alive interval in seconds to prevent Safari from releasing GPU resources.
   * Safari aggressively cleans up "unused" canvases, causing blank charts.
   * Default: 0 (disabled)
   */
  keepAliveInterval?: number;
  /**
   * Mouse wheel zoom speed.
   * Higher values = faster zoom. Default: 0.1 (10% per wheel tick)
   */
  wheelZoomSpeed?: number;
  /**
   * Mouse wheel zoom direction.
   * - "up-in" (default): wheel up/backward zooms in, wheel down/forward zooms out
   * - "up-out": wheel up/backward zooms out, wheel down/forward zooms in
   */
  wheelZoomDirection?: "up-in" | "up-out";
  /**
   * Smallest interactive X viewport span, expressed in the same units as the
   * chart's X values. Invalid or non-positive values retain the chart-type
   * default. This construction option is not part of mutable appearance.
   */
  minViewportRange?: number;
  /**
   * Pin either or both edges of the rendered Y domain.
   *
   * Omitted edges continue to auto-scale from visible data. Supplying both
   * finite edges keeps the Y viewport stable across zoom, LOD selection, and
   * streaming updates. The option is disabled by default and is construction
   * configuration rather than mutable appearance.
   */
  yDomain?: YDomainOptions;
  /**
   * Keyboard zoom speed (+/- keys).
   * Higher values = faster zoom. Default: 0.1 (10% per keypress)
   */
  keyboardZoomSpeed?: number;
  /**
   * Keyboard pan speed (arrow keys).
   * Fraction of visible range to pan per keypress. Default: 0.1 (10%)
   */
  keyboardPanSpeed?: number;
  /**
   * How keyboard controls become active.
   * - "focus" (default): chart must have DOM focus
   * - "hover": chart under the mouse pointer receives keyboard navigation
   */
  keyboardActivation?: "focus" | "hover";
  /**
   * Localize keyboard-action announcements for assistive technologies, or set
   * `false` to disable them. Omitted messages use concise English defaults.
   */
  keyboardAnnouncements?: false | KeyboardAnnouncementMessages;
  /**
   * Maximum time in milliseconds allowed for renderer startup. The watchdog
   * starts during chart construction, so it also protects applications that do
   * not await {@link BaseChart.initialize}. Set to `0` to disable it.
   * Default: 15000.
   */
  rendererInitializationTimeout?: number;
  /**
   * Enable user interactions (pan/zoom/pinch).
   * When false, chart is view-only but still shows crosshair/tooltip on hover.
   * Default: true
   */
  interactive?: boolean;
  /**
   * Rendering mode selection.
   * - "auto": prefer worker+OffscreenCanvas when supported (default)
   * - "worker": force worker rendering (falls back to main if unsupported)
   * - "main": render on the browser main thread (requires a DOM; useful for fallbacks and tests)
   */
  renderMode?: "auto" | "worker" | "main";
  /**
   * Direction used for Canvas2D text. Use "auto" to infer from the first strong
   * character of each string, or "rtl"/"ltr" to force a chart-wide direction.
   * Default: "inherit"
   */
  textDirection?: TextDirection;
  /**
   * Grid line customization for main chart
   */
  grid?: GridOptions;
  /**
   * Axis customization (line color and label colors)
   */
  axis?: AxisOptions;
  /**
   * Chart background (covers entire canvas including preview area).
   * Can be a solid color string, gradient definition, or image.
   * Default: '#16213e'
   */
  chartBackground?: BackgroundOptions;
  /**
   * Range selector (preview chart) configuration
   */
  rangeSelector?: RangeSelectorOptions;
  /**
   * Tooltip (crosshair info box) styling
   */
  tooltip?: TooltipOptions;
  /**
   * Crosshair lines styling (vertical and horizontal guide lines)
   */
  crosshairStyle?: CrosshairOptions;
  /** Selection range (drag-to-zoom) styling */
  selection?: SelectionOptions;
  /** Text labels around the chart (title, axis labels) */
  labels?: ChartLabels;
  /** Declarative overlay primitives rendered above chart content */
  overlay?: OverlayOptions;
}

/** Viewport state returned by getViewport() and accepted by setViewport() */
export interface Viewport {
  xMin: number;
  xMax: number;
}

/** Stage at which a chart renderer stopped working. */
export type RendererFailurePhase = "initialization" | "runtime";

/** Error reported when a chart renderer fails during startup or later use. */
export class ChartRendererError extends Error {
  override readonly name = "ChartRendererError";
  override readonly cause?: Error;

  constructor(
    message: string,
    readonly phase: RendererFailurePhase,
    cause?: Error,
  ) {
    super(message);
    this.cause = cause;
  }
}

/** Called once when the chart renderer fails and is about to be torn down. */
export type RendererErrorCallback = (error: ChartRendererError) => void;

/** Error reported when one or more declarative overlay sources cannot be applied. */
export class ChartOverlayError extends Error {
  override readonly name = "ChartOverlayError";
  override readonly cause?: Error;

  constructor(
    readonly sources: readonly string[],
    cause?: Error,
  ) {
    super(`Overlay failed: ${sources.join(", ")}`);
    this.cause = cause;
  }
}

/** Called when an overlay update has one or more resolution or delivery failures. */
export type OverlayErrorCallback = (error: ChartOverlayError) => void;

/** Axis appearance — same nested shape as AxisOptions for runtime appearance updates. */
export type AxisAppearanceOptions = Pick<AxisOptions, "color" | "width"> & {
  bottom?: Pick<
    XAxisOptions,
    "visible" | "width" | "ticks" | "format" | "labelFont" | "cursorLabel"
  >;
  top?: Pick<XAxisOptions, "visible" | "width" | "ticks" | "format" | "labelFont" | "cursorLabel">;
  left?: Pick<YAxisOptions, "visible" | "width" | "ticks" | "format" | "labelFont" | "cursorLabel">;
  right?: Pick<
    YAxisOptions,
    "visible" | "width" | "ticks" | "format" | "labelFont" | "cursorLabel"
  >;
};

/** Range selector appearance — visual fields only (excludes position, height, gap) */
export type RangeSelectorAppearanceOptions = Pick<
  RangeSelectorOptions,
  | "visible"
  | "width"
  | "effect"
  | "borderRadius"
  | "overlayColor"
  | "handleColor"
  | "gripColor"
  | "handleBorderRadius"
  | "borderColor"
>;

/** Base appearance options — shared between line and stock charts */
export interface BaseAppearanceOptions {
  textDirection?: TextDirection;
  tooltip?: TooltipOptions;
  crosshairStyle?: CrosshairOptions;
  grid?: GridOptions;
  axis?: AxisAppearanceOptions;
  chartBackground?: BackgroundOptions;
  selection?: SelectionOptions;
  labels?: ChartLabels;
  overlay?: OverlayOptions;
  padding?: PaddingOptions;
  rangeSelector?: RangeSelectorAppearanceOptions;
}

export abstract class BaseChart<TOptions extends object = BaseChartOptions> {
  protected canvas: HTMLCanvasElement;
  protected worker: ChartWorkerLike;
  protected readyPromise: Promise<void>;
  protected resolveReady!: () => void;
  protected rejectReady!: (reason?: unknown) => void;
  private readyState: "pending" | "resolved" | "rejected" = "pending";
  private rendererErrorCallback: RendererErrorCallback | null = null;
  private overlayErrorCallback: OverlayErrorCallback | null = null;
  private rendererFailureReported = false;
  protected chartWidth = 0;
  protected lastKnownViewport = { xMin: 0, xMax: 1 };
  protected dataBounds = { xMin: 0, xMax: 1 };
  protected hasDataBounds = false;
  protected showRangeSelector: boolean;
  protected rangeSelectorWidth: "plot" | "canvas";
  protected rangeSelectorPosition: "top" | "bottom";
  protected rangeSelectorHeight: number;
  protected rangeSelectorGap: number;
  protected showLeftAxis: boolean;
  protected showRightAxis: boolean;
  protected animated: boolean;
  protected destroyed = false;
  protected readonly resolvedRenderMode: "worker" | "main";
  protected readonly minViewportRange: number;
  private intersectionObserver: IntersectionObserver | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private keepAliveMs: number;
  private wheelZoomSpeed: number;
  private wheelZoomDirection: "up-in" | "up-out";
  private keyboardZoomSpeed: number;
  private keyboardPanSpeed: number;
  private keyboardActivation: "focus" | "hover";
  private keyboardAnnouncementMessages: Required<KeyboardAnnouncementMessages> | null;
  private keyboardAnnouncementRegion: HTMLElement | null = null;
  private keyboardAnnouncementRevision = 0;
  private keyboardViewportRequestSequence = 0;
  private keyboardAnnouncementWriteTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingKeyboardViewportAnnouncement: {
    requestId: number;
    action: KeyboardViewportAction;
    viewportBefore: Viewport;
  } | null = null;
  private keyboardViewportAnnouncementExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  private rendererInitializationTimer: ReturnType<typeof setTimeout> | null = null;
  private rendererInitializationTimeoutMs: number;
  private interactive: boolean;
  private hoverKeyboardActive = false;
  private readonly allowsDomImageOverlaySources: boolean;
  private readonly workerTransferEnabled: boolean;
  private overlayVersion = 0;
  private overlayResolutionAbortController: AbortController | null = null;
  private padding: { top: number; right: number; bottom: number; left: number };
  private paddingBase: { top: number; right: number; bottom: number; left: number };
  private resizeObserver: ResizeObserver | null = null;
  private resizeRafId: number | null = null;
  private viewportInputRafId: number | null = null;
  private pendingViewportInputs: ViewportInputCommand[] = [];
  // Pending delayed tooltip-hide after touchend (cleared on destroy).
  private tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;
  // AbortController for cleaning up window event listeners
  private eventAbortController = new AbortController();
  private reducedMotionQuery: MediaQueryList | null = null;
  private reducedMotionChangeListener: ((event: MediaQueryListEvent) => void) | null = null;

  private pointerPanSelect: PointerPanSelectController | null = null;

  // Touch interaction state
  private isTouchSelecting = false;
  private isPinching = false;

  // Shared selection state (mouse and touch use the same selection range)
  private selectionStartDataX = 0;
  private selectionEndDataX = 0;
  private lastTapTime = 0;
  private pinchStartDistance = 0;
  private pinchStartRange = 0;
  private pinchAnchorDataX = 0;
  private showTooltipOnMove = false;

  // Shared touch/mouse state
  private tooltipBlocked = false;
  private lastTouchTime = Number.NEGATIVE_INFINITY;
  private singleFingerStartTime = 0;
  private legendInteractive = false;
  private xAxisHeight = 0;
  private legendHitboxes: Array<{ x: number; y: number; width: number; height: number }> = [];

  // Batching state
  private batchDepth = 0;
  private batchQueue: Array<{ message: Record<string, any>; transfer?: Transferable[] }> = [];
  private batchCallbacks: Array<() => void> = [];

  // Shadow state for getOptions() / getAppearance()
  protected optionsShadow: Record<string, any> = {};

  /** Build the initial shadow from construction options with defaults filled in. */
  private buildInitialShadow(
    options: BaseChartOptions,
    extraConfig: Record<string, unknown>,
  ): Record<string, any> {
    const shadow: Record<string, any> = deepClone(options);

    // Fill in base defaults so getOptions() returns a normalized snapshot
    shadow.padding ??= {};
    shadow.padding.top ??= PADDING.top;
    shadow.padding.right ??= PADDING.right;
    shadow.padding.bottom ??= PADDING.bottom;
    shadow.padding.left ??= PADDING.left;
    shadow.animated ??= this.animated;
    shadow.keepAliveInterval ??= 0;
    shadow.wheelZoomSpeed = sanitizeSpeed(shadow.wheelZoomSpeed, 0.1, MAX_ZOOM_SPEED);
    shadow.wheelZoomDirection ??= "up-in";
    shadow.minViewportRange = this.minViewportRange;
    shadow.keyboardZoomSpeed = sanitizeSpeed(shadow.keyboardZoomSpeed, 0.1, MAX_ZOOM_SPEED);
    shadow.keyboardPanSpeed = sanitizeSpeed(shadow.keyboardPanSpeed, 0.1, MAX_PAN_SPEED);
    shadow.keyboardActivation ??= "focus";
    shadow.keyboardAnnouncements =
      this.keyboardAnnouncementMessages === null ? false : { ...this.keyboardAnnouncementMessages };
    shadow.rendererInitializationTimeout = this.rendererInitializationTimeoutMs;
    shadow.interactive ??= true;
    shadow.renderMode ??= "auto";
    shadow.textDirection ??= "inherit";
    shadow.grid ??= {};
    shadow.grid.color ??= "#2d4a7c";
    shadow.grid.lineWidth ??= 0.5;
    shadow.grid.vertical ??= true;
    shadow.grid.horizontal ??= true;
    shadow.axis ??= {};
    shadow.axis.color ??= "#4a6fa1";
    shadow.axis.width ??= 1;
    shadow.chartBackground ??= "#16213e";
    shadow.rangeSelector ??= {};
    shadow.rangeSelector.visible ??= true;
    shadow.rangeSelector.width ??= "plot";
    shadow.rangeSelector.position ??= "bottom";
    shadow.rangeSelector.height ??= RANGE_HEIGHT;
    shadow.rangeSelector.gap ??= 0;
    shadow.rangeSelector.borderRadius ??= 4;
    shadow.rangeSelector.overlayColor ??= "rgba(0, 0, 0, 0.6)";
    shadow.rangeSelector.handleColor ??= "#4a90d9";
    shadow.rangeSelector.gripColor ??= "#fff";
    shadow.rangeSelector.handleBorderRadius ??= 2;
    shadow.rangeSelector.borderColor ??= "#4a6fa1";
    shadow.crosshairStyle ??= {};
    shadow.crosshairStyle.vertical ??= {};
    shadow.crosshairStyle.vertical.color ??= "rgba(255, 255, 255, 0.3)";
    shadow.crosshairStyle.vertical.style ??= "dashed";
    shadow.crosshairStyle.vertical.visible ??= true;
    shadow.crosshairStyle.horizontal ??= {};
    shadow.crosshairStyle.horizontal.color ??= "rgba(255, 255, 255, 0.3)";
    shadow.crosshairStyle.horizontal.style ??= "dashed";
    shadow.crosshairStyle.horizontal.visible ??= true;
    shadow.tooltip ??= {};
    shadow.tooltip.backgroundColor ??= "rgba(22, 33, 62, 0.95)";
    shadow.tooltip.borderColor ??= "#4a6fa1";
    shadow.tooltip.borderWidth ??= 1;
    shadow.tooltip.borderRadius ??= 0;
    shadow.tooltip.borderStyle ??= "solid";
    shadow.tooltip.position ??= "cursor-top";
    shadow.tooltip.showSwatch ??= true;
    shadow.tooltip.padding ??= {};
    shadow.tooltip.padding.top ??= 8;
    shadow.tooltip.padding.right ??= 8;
    shadow.tooltip.padding.bottom ??= 8;
    shadow.tooltip.padding.left ??= 8;
    shadow.selection ??= {};
    shadow.selection.color ??= "rgba(78, 204, 163, 0.2)";
    shadow.selection.borderColor ??= "#4ecca3";
    shadow.selection.borderWidth ??= 2;
    shadow.selection.borderStyle ??= "dashed";

    // Merge extra config (subclass-specific options)
    const extra = this.buildExtraShadow(extraConfig);
    Object.assign(shadow, extra);
    return shadow;
  }

  /** Override to include subclass-specific options in the shadow. */
  protected buildExtraShadow(_extraConfig: Record<string, unknown>): Record<string, any> {
    return {};
  }

  // Layout helper methods - centralized position calculations
  protected getRangeSelectorTop(): number {
    if (this.rangeSelectorPosition === "top") {
      return this.padding.top;
    }
    const rect = this.canvas.getBoundingClientRect();
    return rect.height - this.rangeSelectorHeight;
  }

  protected getChartAreaTop(): number {
    if (this.rangeSelectorPosition === "top" && this.showRangeSelector) {
      return this.padding.top + this.rangeSelectorHeight + this.rangeSelectorGap;
    }
    return this.padding.top;
  }

  protected getChartAreaBottom(): number {
    const rect = this.canvas.getBoundingClientRect();
    if (this.rangeSelectorPosition === "bottom" && this.showRangeSelector) {
      return rect.height - this.rangeSelectorHeight - this.rangeSelectorGap;
    }
    return rect.height;
  }

  // Hit testing helpers
  private isInMainChart(x: number, y: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const chartLeft = this.padding.left;
    const chartRight = rect.width - this.padding.right;
    const chartTop = this.getChartAreaTop();
    const chartBottom = this.getChartAreaBottom() - this.padding.bottom;
    return x >= chartLeft && x < chartRight && y >= chartTop && y < chartBottom;
  }

  private isInXAxisArea(x: number, y: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const chartLeft = this.padding.left;
    const chartRight = rect.width - this.padding.right;
    const chartBottom = this.getChartAreaBottom() - this.padding.bottom;
    const band = this.xAxisHeight > 0 ? this.xAxisHeight : this.padding.bottom;
    const xAxisBottom = chartBottom + band;
    return x >= chartLeft && x < chartRight && y >= chartBottom && y < xAxisBottom;
  }

  private isInLegendArea(x: number, y: number): boolean {
    if (!this.legendInteractive || this.legendHitboxes.length === 0) return false;
    for (let i = this.legendHitboxes.length - 1; i >= 0; i--) {
      const box = this.legendHitboxes[i];
      if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
        return true;
      }
    }
    return false;
  }

  private applyLegendHoverCursor(x: number, y: number): boolean {
    if (this.pointerPanSelect?.isActive) return false;
    if (!this.isInLegendArea(x, y)) return false;
    this.canvas.style.cursor = "pointer";
    return true;
  }

  // Selection helpers - shared between mouse and touch
  private startSelection(screenX: number): void {
    this.selectionStartDataX = this.screenToDataX(screenX - this.padding.left);
    this.selectionEndDataX = this.selectionStartDataX;
    this.worker.postMessage({
      type: "setSelection",
      start: this.selectionStartDataX,
      end: this.selectionEndDataX,
    });
  }

  private updateSelection(screenX: number): void {
    this.selectionEndDataX = this.screenToDataX(screenX - this.padding.left);
    this.worker.postMessage({
      type: "setSelection",
      start: this.selectionStartDataX,
      end: this.selectionEndDataX,
    });
  }

  private completeSelection(): void {
    this.worker.postMessage({ type: "clearSelection" });

    const xMin = Math.min(this.selectionStartDataX, this.selectionEndDataX);
    const xMax = Math.max(this.selectionStartDataX, this.selectionEndDataX);

    const visibleRange = this.lastKnownViewport.xMax - this.lastKnownViewport.xMin;
    if (xMax - xMin > visibleRange * SELECTION_MIN_THRESHOLD) {
      const rangeType = this.animated ? "setViewportRangeAnimated" : "setViewportRange";
      this.worker.postMessage({ type: rangeType, xMin, xMax });
      this.onViewportManualChange();
    }
  }

  private get isSelecting(): boolean {
    return (this.pointerPanSelect?.isSelecting ?? false) || this.isTouchSelecting;
  }

  private cancelSelectionInteraction(): void {
    this.pointerPanSelect?.cancel();
    this.isTouchSelecting = false;
    this.worker.postMessage({ type: "clearSelection" });
    this.canvas.style.cursor = "default";
  }

  constructor(
    canvas: HTMLCanvasElement,
    rendererFactory: RendererFactory,
    options: BaseChartOptions = {},
    extraConfig: Record<string, unknown> = {},
    useOffscreen = true,
    resolvedRenderMode: "worker" | "main" = useOffscreen ? "worker" : "main",
    defaultMinViewportRange = 0,
  ) {
    assertValidChartLabels(options.labels);
    this.resolvedRenderMode = resolvedRenderMode;
    this.minViewportRange = resolveMinViewportRange(
      options.minViewportRange,
      defaultMinViewportRange,
    );
    const yDomain = resolveYDomain(options.yDomain);
    const interactive = options.interactive ?? true;
    this.canvas = canvas;

    // A keyboard-operated canvas has no matching ARIA widget role.
    // `application` lets assistive technologies pass the chart's documented
    // arrow/zoom/reset keys through. View-only charts retain image semantics
    // and do not become an otherwise-actionless tab stop. Every explicit host
    // attribute remains authoritative.
    if (!canvas.hasAttribute("tabindex") && interactive) {
      canvas.setAttribute("tabindex", "0");
    }
    if (!canvas.hasAttribute("role")) {
      canvas.setAttribute("role", interactive ? "application" : "img");
    }
    if (!canvas.hasAttribute("aria-label") && !canvas.hasAttribute("aria-labelledby")) {
      canvas.setAttribute("aria-label", interactive ? "Interactive chart" : "Chart");
    }

    // Apply necessary styles to canvas for iOS Safari compatibility
    if (interactive) {
      canvas.style.touchAction = "none";
    }
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    // GPU acceleration - prevents canvas corruption on iOS Safari
    canvas.style.transform = "translateZ(0)";
    canvas.style.webkitTransform = "translateZ(0)";
    canvas.style.backfaceVisibility = "hidden";
    canvas.style.webkitBackfaceVisibility = "hidden";
    canvas.style.willChange = "transform";

    // Per-instance padding (merged with defaults)
    this.padding = {
      top: options.padding?.top ?? PADDING.top,
      right: options.padding?.right ?? PADDING.right,
      bottom: options.padding?.bottom ?? PADDING.bottom,
      left: options.padding?.left ?? PADDING.left,
    };
    this.paddingBase = { ...this.padding };

    // Reserve space for chart labels (must match worker's measureLabelSpace)
    if (options.labels) {
      this.applyLabelPadding(options.labels);
    }

    this.showRangeSelector = options.rangeSelector?.visible ?? true;
    this.rangeSelectorWidth = options.rangeSelector?.width ?? "plot";
    this.rangeSelectorPosition = options.rangeSelector?.position ?? "bottom";
    this.rangeSelectorHeight = options.rangeSelector?.height ?? RANGE_HEIGHT;
    this.rangeSelectorGap = options.rangeSelector?.gap ?? 0;
    this.animated = options.animated ?? !prefersReducedMotion();
    this.keepAliveMs = (options.keepAliveInterval ?? 0) * 1000;
    this.wheelZoomSpeed = sanitizeSpeed(options.wheelZoomSpeed, 0.1, MAX_ZOOM_SPEED);
    this.wheelZoomDirection = options.wheelZoomDirection ?? "up-in";
    this.keyboardZoomSpeed = sanitizeSpeed(options.keyboardZoomSpeed, 0.1, MAX_ZOOM_SPEED);
    this.keyboardPanSpeed = sanitizeSpeed(options.keyboardPanSpeed, 0.1, MAX_PAN_SPEED);
    this.keyboardActivation = options.keyboardActivation ?? "focus";
    this.keyboardAnnouncementMessages =
      options.keyboardAnnouncements === false
        ? null
        : {
            ...DEFAULT_KEYBOARD_ANNOUNCEMENTS,
            ...options.keyboardAnnouncements,
          };
    this.rendererInitializationTimeoutMs = resolveRendererInitializationTimeout(
      options.rendererInitializationTimeout,
    );
    this.interactive = interactive;
    this.workerTransferEnabled =
      useOffscreen && typeof canvas.transferControlToOffscreen === "function";
    this.allowsDomImageOverlaySources = !this.workerTransferEnabled;
    this.ensureKeyboardAnnouncementRegion();

    // Axis visibility (from new consolidated axis config)
    const defaultLeftAxis = extraConfig.defaultLeftAxis as boolean | undefined;
    const defaultRightAxis = extraConfig.defaultRightAxis as boolean | undefined;
    this.showLeftAxis = options.axis?.left?.visible ?? defaultLeftAxis ?? true;
    this.showRightAxis = options.axis?.right?.visible ?? defaultRightAxis ?? false;

    // Initialize shadow state from construction options + extra config
    this.optionsShadow = this.buildInitialShadow(options, extraConfig);
    if (yDomain) {
      this.optionsShadow.yDomain = yDomain;
    } else {
      delete this.optionsShadow.yDomain;
    }

    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = () => {
        if (this.readyState !== "pending") return;
        this.readyState = "resolved";
        this.clearRendererInitializationWatchdog();
        resolve();
      };
      this.rejectReady = (reason?: unknown) => {
        if (this.readyState !== "pending") return;
        this.readyState = "rejected";
        this.clearRendererInitializationWatchdog();
        reject(reason);
      };
    });
    // Consumers may choose not to await initialize(); keep lifecycle rejection
    // deterministic without creating an unhandled-rejection side channel.
    void this.readyPromise.catch(() => {});

    this.worker = rendererFactory();
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    this.worker.onerror = this.handleRendererError;
    this.worker.onmessageerror = this.handleRendererMessageError;
    this.startRendererInitializationWatchdog();

    let initCanvas: HTMLCanvasElement | OffscreenCanvas = canvas;
    const transferList: Transferable[] = [];
    const transferSet = new Set<Transferable>();
    const addTransferable = (value: Transferable): void => {
      if (transferSet.has(value)) return;
      transferSet.add(value);
      transferList.push(value);
    };
    if (this.workerTransferEnabled) {
      const offscreen = canvas.transferControlToOffscreen();
      initCanvas = offscreen;
      addTransferable(offscreen);
    }

    // Both renderer transports clone caller-supplied ImageBitmaps. Mark the
    // receiver's clone as renderer-owned without consuming the public handle.
    let chartBackground = options.chartBackground;
    if (
      chartBackground &&
      typeof chartBackground === "object" &&
      chartBackground.type === "image"
    ) {
      chartBackground = {
        ...chartBackground,
        __sixtyfoldOwnsImageBitmap: true,
        __sixtyfoldHostOwnsImageBitmap: undefined,
      } as BackgroundOptions;
    }

    const { overlay: initOverlay, hasDeferredImages } = prepareOverlayForInit(
      options.overlay,
      this.allowsDomImageOverlaySources,
    );

    // Worker postMessage snapshots ordinary configuration objects. Mirror that
    // boundary in main-thread mode as well so renderers never retain or mutate
    // caller-owned objects (including recursively frozen theme presets).
    const rendererConfig = deepClone({
      padding: options.padding,
      animated: this.animated,
      minViewportRange: this.minViewportRange,
      yDomain,
      textDirection: options.textDirection,
      grid: options.grid,
      axis: options.axis,
      chartBackground,
      rangeSelector: options.rangeSelector,
      tooltip: options.tooltip,
      crosshairStyle: options.crosshairStyle,
      selection: options.selection,
      labels: options.labels,
      overlay: initOverlay,
      ...extraConfig,
    });

    this.worker.postMessage(
      {
        type: "init",
        canvas: initCanvas,
        dpr: window.devicePixelRatio || 1,
        config: rendererConfig,
      },
      transferList.length ? transferList : undefined,
    );

    if (hasDeferredImages && options.overlay) {
      this.resolveOverlayWithoutUnhandledRejection(options.overlay);
    }

    if (options.animated === undefined) {
      this.watchReducedMotionPreference();
    }
    this.setupEventListeners();
    this.resize();

    const signal = this.eventAbortController.signal;
    window.addEventListener("resize", this.scheduleResize, { signal });
    this.watchDevicePixelRatio();

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.scheduleResize();
      });
      this.resizeObserver.observe(this.canvas);
      if (this.canvas.parentElement) {
        this.resizeObserver.observe(this.canvas.parentElement);
      }
    }

    // Handle Safari's aggressive GPU resource release when tab is backgrounded
    document.addEventListener("visibilitychange", this.handleVisibilityChange, {
      signal,
    });

    // Handle Safari releasing GPU resources when window loses focus (user switches apps)
    window.addEventListener("focus", this.handleWindowFocus, { signal });

    // Handle Safari releasing GPU resources for offscreen canvases
    // When canvas scrolls back into view, force re-render
    if (typeof IntersectionObserver !== "undefined") {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              this.worker.postMessage({ type: "invalidateCache" });
            }
          }
        },
        { threshold: 0 },
      );
      this.intersectionObserver.observe(this.canvas);
    }

    // Keep-alive to prevent Safari from releasing GPU resources during extended idle
    if (this.keepAliveMs > 0) {
      this.keepAliveTimer = setInterval(() => {
        this.worker.postMessage({ type: "invalidateCache" });
      }, this.keepAliveMs);
    }
  }

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === "visible") {
      // Force full redraw when tab becomes visible again
      // This fixes Safari canvas corruption after being backgrounded
      this.worker.postMessage({ type: "invalidateCache" });
    }
  };

  private handleWindowFocus = (): void => {
    // Force redraw when window regains focus
    // Safari may release GPU resources after extended idle even if canvas visible
    this.worker.postMessage({ type: "invalidateCache" });
  };

  /**
   * Wait until the renderer is ready for data and runtime commands.
   *
   * The construction-time initialization watchdog rejects this promise with a
   * {@link ChartRendererError} when the worker or main-thread fallback does not
   * become ready in the configured interval. Applications should await this
   * method before installing their first dataset.
   */
  async initialize(): Promise<void> {
    await this.readyPromise;
  }

  private startRendererInitializationWatchdog(): void {
    if (
      this.rendererInitializationTimeoutMs === 0 ||
      this.readyState !== "pending" ||
      this.rendererInitializationTimer !== null
    ) {
      return;
    }
    this.rendererInitializationTimer = setTimeout(() => {
      this.rendererInitializationTimer = null;
      this.failRenderer(
        new Error(`Timeout: ${this.rendererInitializationTimeoutMs} ms`),
        "initialization",
      );
    }, this.rendererInitializationTimeoutMs);
  }

  private clearRendererInitializationWatchdog(): void {
    if (this.rendererInitializationTimer === null) return;
    clearTimeout(this.rendererInitializationTimer);
    this.rendererInitializationTimer = null;
  }

  /**
   * Register a one-shot renderer failure callback.
   *
   * Called once before teardown for initialization or runtime failures. Without
   * a callback, errors use `console.error`. Pass `null` to cancel it;
   * {@link destroy} calls do not invoke it.
   */
  setRendererErrorCallback(callback: RendererErrorCallback | null): void {
    if (this.destroyed) return;
    this.rendererErrorCallback = callback;
  }

  /**
   * Register a callback for non-fatal overlay resolution or delivery failures.
   *
   * Successful overlay items are still installed. The matching
   * {@link setOverlay} promise also rejects with the same error.
   */
  setOverlayErrorCallback(callback: OverlayErrorCallback | null): void {
    if (this.destroyed) return;
    this.overlayErrorCallback = callback;
  }

  private handleRendererError = (event: ErrorEvent): void => {
    event.preventDefault?.();
    const phase = this.currentRendererFailurePhase();
    const error =
      event.error instanceof Error ? event.error : new Error(event.message || "Renderer failed");
    this.failRenderer(error, phase);
  };

  private handleRendererMessageError = (): void => {
    this.failRenderer(new Error("Invalid renderer message"), this.currentRendererFailurePhase());
  };

  private currentRendererFailurePhase(): RendererFailurePhase {
    return this.readyState === "pending" ? "initialization" : "runtime";
  }

  protected failRenderer(
    error: Error,
    phase: RendererFailurePhase = this.currentRendererFailurePhase(),
  ): void {
    if (this.destroyed || this.rendererFailureReported) return;
    this.rendererFailureReported = true;
    const reportedError =
      error instanceof ChartRendererError && error.phase === phase
        ? error
        : new ChartRendererError(error.message, phase, error);
    this.rejectReady(reportedError);
    const callback = this.rendererErrorCallback;
    this.rendererErrorCallback = null;
    try {
      void (callback ?? console.error)(reportedError);
    } finally {
      this.destroy();
    }
  }

  protected abstract handleWorkerMessage(e: MessageEvent): void;

  protected handleStatsMessage(data: Record<string, unknown>): void {
    if (data.viewport && typeof data.viewport === "object") {
      const viewport = data.viewport as Record<string, unknown>;
      if (
        typeof viewport.xMin === "number" &&
        Number.isFinite(viewport.xMin) &&
        typeof viewport.xMax === "number" &&
        Number.isFinite(viewport.xMax)
      ) {
        this.lastKnownViewport = {
          xMin: viewport.xMin,
          xMax: viewport.xMax,
        };
      }
    }
    if (data.dataBounds && typeof data.dataBounds === "object") {
      const dataBounds = data.dataBounds as Record<string, unknown>;
      if (
        typeof dataBounds.xMin === "number" &&
        Number.isFinite(dataBounds.xMin) &&
        typeof dataBounds.xMax === "number" &&
        Number.isFinite(dataBounds.xMax)
      ) {
        this.dataBounds = {
          xMin: dataBounds.xMin,
          xMax: dataBounds.xMax,
        };
        this.hasDataBounds = true;
      }
    }
  }

  /**
   * Apply a renderer-confirmed viewport update and announce a pending keyboard
   * action only when the renderer actually changed the visible range.
   */
  protected handleViewportSyncMessage(data: Record<string, unknown>): void {
    this.handleStatsMessage(data);
    const pending = this.pendingKeyboardViewportAnnouncement;
    if (pending && data.viewportRequestId === pending.requestId) {
      const viewportChanged =
        pending.viewportBefore.xMin !== this.lastKnownViewport.xMin ||
        pending.viewportBefore.xMax !== this.lastKnownViewport.xMax;
      this.clearPendingKeyboardViewportAnnouncement();
      if (!viewportChanged) return;
      this.announceKeyboardAction(pending.action, this.lastKnownViewport);
    }
  }

  /** Sync interaction geometry from renderer layout (worker/main-thread engine). */
  protected syncLayoutFromRenderer(data: Record<string, unknown>): void {
    const next = resolveRendererLayoutSync({
      data,
      padding: this.padding,
      xAxisHeight: this.xAxisHeight,
      canvasWidth: this.canvas.getBoundingClientRect().width,
    });
    if (!next) return;

    this.xAxisHeight = next.xAxisHeight;
    this.padding = next.padding;
    if (next.chartWidth !== undefined) {
      this.chartWidth = next.chartWidth;
    }
  }

  protected syncLegendInteractionFromRenderer(data: Record<string, unknown>): void {
    this.legendInteractive = data.legendInteractive === true;
    const raw = data.legendHitboxes;
    if (!Array.isArray(raw)) {
      this.legendHitboxes = [];
      return;
    }

    const next: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const box = item as Record<string, unknown>;
      const x = box.x;
      const y = box.y;
      const width = box.width;
      const height = box.height;
      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        typeof width !== "number" ||
        typeof height !== "number"
      ) {
        continue;
      }
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      ) {
        continue;
      }
      if (width <= 0 || height <= 0) continue;
      next.push({ x, y, width, height });
    }
    this.legendHitboxes = next;
  }

  protected configureStats(enabled: boolean, intervalMs?: number): void {
    if (this.destroyed) return;
    this.worker.postMessage({
      type: "setStatsConfig",
      enabled,
      intervalMs,
    });
  }

  resize = (): void => {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    this.flushViewportInputs();
    this.chartWidth = rect.width - this.padding.left - this.padding.right;

    this.worker.postMessage({
      type: "resize",
      width: rect.width,
      height: rect.height,
      // Re-send dpr: it can change without an element resize (monitor change,
      // browser zoom), and the renderer keeps using the last value otherwise.
      dpr: window.devicePixelRatio || 1,
    });
  };

  // devicePixelRatio changes (monitor move / browser zoom) don't trigger a
  // ResizeObserver, so watch the current resolution via matchMedia and force a
  // resize (which carries the fresh dpr) whenever it changes.
  private watchDevicePixelRatio = (): void => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const query = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => {
      if (this.destroyed) return;
      this.scheduleResize();
      // Re-arm against the new dpr (each query only fires for one ratio).
      this.watchDevicePixelRatio();
    };
    // `once` so the re-arm in onChange replaces this listener cleanly.
    query.addEventListener("change", onChange, {
      once: true,
      signal: this.eventAbortController.signal,
    });
  };

  private watchReducedMotionPreference(): void {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent): void => {
      if (this.destroyed) return;
      const animated = !event.matches;
      if (this.animated === animated) return;
      this.animated = animated;
      this.optionsShadow.animated = animated;
      this.flushViewportInputs();
      this.worker.postMessage({ type: "setAnimated", animated });
    };
    this.reducedMotionQuery = query;
    this.reducedMotionChangeListener = onChange;
    query.addEventListener("change", onChange);
  }

  private announceKeyboardAction(action: KeyboardChartAction, viewport?: Viewport): void {
    const actionMessage = this.keyboardAnnouncementMessages?.[action];
    const message = actionMessage ? this.formatKeyboardAnnouncement(actionMessage, viewport) : "";
    if (!message || this.destroyed || typeof document === "undefined") return;

    const region = this.ensureKeyboardAnnouncementRegion();
    if (!region) return;
    const revision = ++this.keyboardAnnouncementRevision;
    if (this.keyboardAnnouncementWriteTimer !== null) {
      clearTimeout(this.keyboardAnnouncementWriteTimer);
      this.keyboardAnnouncementWriteTimer = null;
    }
    region.textContent = "";
    this.keyboardAnnouncementWriteTimer = setTimeout(() => {
      this.keyboardAnnouncementWriteTimer = null;
      if (
        this.destroyed ||
        revision !== this.keyboardAnnouncementRevision ||
        this.keyboardAnnouncementRegion !== region
      ) {
        return;
      }
      region.textContent = message;
    }, 0);
  }

  private formatKeyboardAnnouncement(actionMessage: string, viewport?: Viewport): string {
    const template = this.keyboardAnnouncementMessages?.viewport;
    if (!template || !viewport || !this.hasDataBounds) return actionMessage;
    const range = this.dataBounds.xMax - this.dataBounds.xMin;
    if (!(range > 0)) return actionMessage;
    const percent = (value: number): string =>
      String(Math.round(Math.max(0, Math.min(100, value))));
    const startPercent = percent(((viewport.xMin - this.dataBounds.xMin) / range) * 100);
    const endPercent = percent(((viewport.xMax - this.dataBounds.xMin) / range) * 100);
    const spanPercent = percent(((viewport.xMax - viewport.xMin) / range) * 100);
    const viewportMessage = template
      .replaceAll("{startPercent}", startPercent)
      .replaceAll("{endPercent}", endPercent)
      .replaceAll("{spanPercent}", spanPercent)
      .trim();
    return viewportMessage ? `${actionMessage} ${viewportMessage}` : actionMessage;
  }

  /**
   * Replace or disable the localized keyboard-action announcements at runtime.
   * Existing pending announcements are cancelled.
   */
  setKeyboardAnnouncements(messages: false | KeyboardAnnouncementMessages): void {
    if (this.destroyed) return;
    this.clearPendingKeyboardViewportAnnouncement();
    this.keyboardAnnouncementRevision++;
    if (this.keyboardAnnouncementWriteTimer !== null) {
      clearTimeout(this.keyboardAnnouncementWriteTimer);
      this.keyboardAnnouncementWriteTimer = null;
    }
    this.keyboardAnnouncementMessages =
      messages === false
        ? null
        : {
            ...DEFAULT_KEYBOARD_ANNOUNCEMENTS,
            ...messages,
          };
    this.optionsShadow.keyboardAnnouncements =
      this.keyboardAnnouncementMessages === null ? false : { ...this.keyboardAnnouncementMessages };
    if (this.keyboardAnnouncementMessages) {
      this.ensureKeyboardAnnouncementRegion();
    } else {
      this.keyboardAnnouncementRegion?.remove();
      this.keyboardAnnouncementRegion = null;
    }
  }

  private ensureKeyboardAnnouncementRegion(): HTMLElement | null {
    if (
      this.keyboardAnnouncementRegion ||
      !this.keyboardAnnouncementMessages ||
      this.destroyed ||
      typeof document === "undefined" ||
      !document.body
    ) {
      return this.keyboardAnnouncementRegion;
    }

    const region = document.createElement("div");
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    region.dataset.sixtyfoldKeyboardAnnouncements = "";
    Object.assign(region.style, {
      position: "fixed",
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "-1px",
      overflow: "hidden",
      clip: "rect(0, 0, 0, 0)",
      whiteSpace: "nowrap",
      border: "0",
    });
    document.body.append(region);
    this.keyboardAnnouncementRegion = region;
    return region;
  }

  private requestKeyboardViewportAnnouncement(action: KeyboardViewportAction): number | undefined {
    if (!this.keyboardAnnouncementMessages?.[action] || this.destroyed) return undefined;
    this.clearPendingKeyboardViewportAnnouncement();
    this.keyboardViewportRequestSequence =
      this.keyboardViewportRequestSequence >= Number.MAX_SAFE_INTEGER
        ? 1
        : this.keyboardViewportRequestSequence + 1;
    const requestId = this.keyboardViewportRequestSequence;
    this.pendingKeyboardViewportAnnouncement = {
      requestId,
      action,
      viewportBefore: { ...this.lastKnownViewport },
    };
    this.keyboardViewportAnnouncementExpiryTimer = setTimeout(() => {
      this.keyboardViewportAnnouncementExpiryTimer = null;
      this.pendingKeyboardViewportAnnouncement = null;
    }, KEYBOARD_VIEWPORT_ANNOUNCEMENT_EXPIRY_MS);
    return requestId;
  }

  private clearPendingKeyboardViewportAnnouncement(): void {
    if (this.keyboardViewportAnnouncementExpiryTimer !== null) {
      clearTimeout(this.keyboardViewportAnnouncementExpiryTimer);
      this.keyboardViewportAnnouncementExpiryTimer = null;
    }
    this.pendingKeyboardViewportAnnouncement = null;
  }

  private scheduleResize = (): void => {
    if (this.destroyed || this.resizeRafId !== null) return;
    this.resizeRafId = requestAnimationFrame(() => {
      this.resizeRafId = null;
      this.resize();
    });
  };

  protected setupEventListeners(): void {
    const self = this;
    setupKeyboardEvents({
      canvas: this.canvas,
      worker: this.worker,
      signal: this.eventAbortController.signal,
      get interactive() {
        return self.interactive;
      },
      get keyboardZoomSpeed() {
        return self.keyboardZoomSpeed;
      },
      get keyboardPanSpeed() {
        return self.keyboardPanSpeed;
      },
      get keyboardActivation() {
        return self.keyboardActivation;
      },
      get hoverKeyboardActive() {
        return self.hoverKeyboardActive;
      },
      get animated() {
        return self.animated;
      },
      get viewport() {
        return self.lastKnownViewport;
      },
      get isSelecting() {
        return self.isSelecting;
      },
      cancelSelection() {
        self.cancelSelectionInteraction();
      },
      flushViewportInputs() {
        self.flushViewportInputs();
      },
      sendReset(viewportRequestId) {
        self.sendReset(viewportRequestId);
      },
      onViewportManualChange() {
        self.onViewportManualChange();
      },
      requestKeyboardViewportAnnouncement(action) {
        return self.requestKeyboardViewportAnnouncement(action);
      },
      announceKeyboardAction(action) {
        self.announceKeyboardAction(action);
      },
    });
    this.setupMouseEvents();
    this.setupTouchEvents();
    this.setupRangeSelectorEvents();
  }

  private setupMouseEvents(): void {
    const signal = this.eventAbortController.signal;

    // Mouse wheel zoom
    this.canvas.addEventListener("wheel", this.handleWheel.bind(this), {
      passive: !this.interactive,
      signal,
    });

    const self = this;
    this.pointerPanSelect = setupPointerPanSelectEvents({
      canvas: this.canvas,
      signal,
      get interactive() {
        return self.interactive;
      },
      get lastTouchTime() {
        return self.lastTouchTime;
      },
      get chartWidth() {
        return self.chartWidth;
      },
      isInMainChart(x, y) {
        return self.isInMainChart(x, y);
      },
      isInXAxisArea(x, y) {
        return self.isInXAxisArea(x, y);
      },
      isInLegendArea(x, y) {
        return self.isInLegendArea(x, y);
      },
      applyLegendHoverCursor(x, y) {
        return self.applyLegendHoverCursor(x, y);
      },
      startSelection(x) {
        self.startSelection(x);
      },
      updateSelection(x) {
        self.updateSelection(x);
      },
      completeSelection() {
        self.completeSelection();
      },
      sendReset() {
        self.sendReset();
      },
      queuePan(dx) {
        self.queueViewportInput({ type: "pan", dx });
      },
      flushViewportInputs() {
        self.flushViewportInputs();
      },
      syncPointer(clientX, clientY) {
        const rect = self.canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
          self.worker.postMessage({
            type: "mousemove",
            x,
            y,
            pointerType: "mouse",
          });
        } else {
          self.worker.postMessage({ type: "mouseleave" });
        }
      },
      onViewportManualChange() {
        self.onViewportManualChange();
      },
    });

    // Mouse tracking for crosshair
    this.canvas.addEventListener(
      "mousemove",
      (e) => {
        // Skip if tooltip is blocked or recent touch activity (debounce synthetic events)
        if (
          this.tooltipBlocked ||
          this.pointerPanSelect?.isActive ||
          performance.now() - this.lastTouchTime < TOUCH_DEBOUNCE_MS
        )
          return;

        const rect = this.canvas.getBoundingClientRect();
        this.worker.postMessage({
          type: "mousemove",
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          pointerType: "mouse",
        });
      },
      { signal },
    );

    this.canvas.addEventListener(
      "mouseenter",
      () => {
        if (performance.now() - this.lastTouchTime < TOUCH_DEBOUNCE_MS) return;
        this.hoverKeyboardActive = true;
      },
      { signal },
    );

    this.canvas.addEventListener(
      "mouseleave",
      () => {
        this.hoverKeyboardActive = false;
        this.worker.postMessage({ type: "mouseleave" });
        this.onTooltipLeave();
      },
      { signal },
    );
  }

  private setupTouchEvents(): void {
    const signal = this.eventAbortController.signal;

    this.canvas.addEventListener(
      "touchstart",
      (e) => {
        this.flushViewportInputs();
        this.lastTouchTime = performance.now();
        this.hoverKeyboardActive = false;
        // Always hide tooltip on any new touch - will re-show if appropriate
        this.worker.postMessage({ type: "mouseleave" });
        this.onTooltipLeave();

        if (e.touches.length === 1) {
          const touch = e.touches[0];
          const rect = this.canvas.getBoundingClientRect();
          const x = touch.clientX - rect.left;
          const y = touch.clientY - rect.top;

          this.isPinching = false;
          this.isTouchSelecting = false;
          this.showTooltipOnMove = false;
          const inLegend = this.isInLegendArea(x, y);
          const inMainChart = this.isInMainChart(x, y);
          const inXAxisArea = !inLegend && this.isInXAxisArea(x, y);

          const now = performance.now();
          if (
            this.interactive &&
            (inMainChart || inXAxisArea) &&
            now - this.lastTapTime < DOUBLE_TAP_MS
          ) {
            // Double-tap: reset chart, block tooltip until finger lifts
            this.tooltipBlocked = true;
            this.sendReset();
            this.isTouchSelecting = false;
          } else if (this.interactive && inXAxisArea) {
            // X-axis area: direct selection
            this.isTouchSelecting = true;
            this.startSelection(x);
          } else if (inMainChart) {
            // Main chart: enable tooltip on touchmove (not touchstart)
            // Don't clear tooltipBlocked here - let touchmove clear it after delay
            // This prevents flicker during rapid finger re-positioning
            this.showTooltipOnMove = true;
            this.singleFingerStartTime = performance.now();
          }
          this.lastTapTime = now;
        } else if (this.interactive && e.touches.length === 2) {
          e.preventDefault();
          this.isTouchSelecting = false;
          this.isPinching = true;
          this.showTooltipOnMove = false;
          this.tooltipBlocked = true; // Block synthetic mouse events during pan/zoom

          // Capture initial state for anchor-based transform
          this.pinchStartDistance = this.getPinchDistance(e.touches);
          this.pinchStartRange = this.lastKnownViewport.xMax - this.lastKnownViewport.xMin;

          // Record the data value under the touch center - this stays anchored
          const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const rect = this.canvas.getBoundingClientRect();
          const centerScreenX = centerX - rect.left - this.padding.left;
          this.pinchAnchorDataX = this.screenToDataX(centerScreenX);

          // Hide crosshair/tooltip during pan/zoom
          this.worker.postMessage({ type: "mouseleave" });
          this.worker.postMessage({ type: "clearSelection" });
        }
      },
      { passive: !this.interactive, signal },
    );

    this.canvas.addEventListener(
      "touchmove",
      (e) => {
        this.lastTouchTime = performance.now();
        if (this.isPinching && e.touches.length === 2) {
          e.preventDefault();

          // Calculate scale from pinch distance change. Guard against
          // coincident touch points (distance 0) and an un-laid-out chart
          // (chartWidth 0), either of which would produce Infinity/NaN
          // viewport bounds posted to the renderer.
          const currentDistance = this.getPinchDistance(e.touches);
          if (currentDistance <= 0 || this.chartWidth <= 0) {
            return;
          }
          let scale = this.pinchStartDistance / currentDistance;
          if (!Number.isFinite(scale) || scale <= 0) {
            return;
          }

          // Dead zone: ignore small pinch changes to allow pure panning
          if (Math.abs(scale - 1) < PINCH_DEAD_ZONE) {
            scale = 1; // No zoom, just pan
          }

          // Get current touch center position
          const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const rect = this.canvas.getBoundingClientRect();
          const centerScreenX = centerX - rect.left - this.padding.left;

          // Calculate new viewport range based on scale
          const newRange = this.pinchStartRange * scale;

          // Position viewport so anchor data point stays under touch center
          // Formula: anchorDataX should map to centerScreenX
          // screenX = (dataX - xMin) / range * chartWidth
          // Therefore: xMin = anchorDataX - (centerScreenX / chartWidth) * range
          const xMin = this.pinchAnchorDataX - (centerScreenX / this.chartWidth) * newRange;
          const xMax = xMin + newRange;

          this.flushViewportInputs();
          this.worker.postMessage({ type: "setViewportRange", xMin, xMax });
          this.onViewportManualChange();
        } else if (this.isTouchSelecting && e.touches.length === 1) {
          // X-axis selection mode: update selection range
          e.preventDefault();
          const touch = e.touches[0];
          const rect = this.canvas.getBoundingClientRect();
          this.updateSelection(touch.clientX - rect.left);

          this.worker.postMessage({
            type: "mousemove",
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top,
            pointerType: "touch",
          });
        } else if (this.showTooltipOnMove && e.touches.length === 1) {
          // Single touch with tooltip enabled
          // Clear tooltip block only after finger has been stable
          // This prevents flicker during rapid finger re-positioning
          if (
            this.tooltipBlocked &&
            performance.now() - this.singleFingerStartTime > TOOLTIP_SHOW_DELAY_MS
          ) {
            this.tooltipBlocked = false;
          }
          if (!this.tooltipBlocked) {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            this.worker.postMessage({
              type: "mousemove",
              x: touch.clientX - rect.left,
              y: touch.clientY - rect.top,
              pointerType: "touch",
            });
          }
        }
      },
      { passive: !this.interactive, signal },
    );

    this.canvas.addEventListener(
      "touchend",
      (e) => {
        this.lastTouchTime = performance.now();
        if (e.touches.length === 0) {
          if (this.isTouchSelecting) {
            this.completeSelection();
          }

          // Only schedule delayed mouseleave if we were showing tooltip/crosshair
          const wasShowingTooltip = this.showTooltipOnMove || this.isTouchSelecting;

          this.isTouchSelecting = false;
          this.isPinching = false;
          this.showTooltipOnMove = false;
          this.tooltipBlocked = false; // Clear so mouse events work after touch

          if (wasShowingTooltip) {
            if (this.tooltipHideTimer !== null) {
              clearTimeout(this.tooltipHideTimer);
            }
            this.tooltipHideTimer = setTimeout(() => {
              this.tooltipHideTimer = null;
              if (this.destroyed) return;
              this.worker.postMessage({ type: "mouseleave" });
              this.onTooltipLeave();
            }, TOOLTIP_HIDE_DELAY_MS);
          }
        } else if (e.touches.length === 1) {
          // Transition from 2 fingers to 1: stop pan/zoom, but don't show tooltip
          // Tooltip only appears on fresh single-finger touch
          this.isPinching = false;
          this.isTouchSelecting = false;
          // showTooltipOnMove stays false - user must lift and touch again for tooltip
        }
      },
      { signal },
    );

    this.canvas.addEventListener(
      "touchcancel",
      () => {
        this.isTouchSelecting = false;
        this.isPinching = false;
        this.showTooltipOnMove = false;
        this.tooltipBlocked = false;
        this.worker.postMessage({ type: "clearSelection" });
        this.worker.postMessage({ type: "mouseleave" });
        this.onTooltipLeave();
      },
      { signal },
    );
  }

  protected setupRangeSelectorEvents(): void {
    const self = this;
    attachRangeSelectorEvents({
      canvas: this.canvas,
      worker: this.worker,
      signal: this.eventAbortController.signal,
      get rangeSelectorLeft() {
        return self.rangeSelectorWidth === "canvas" ? 0 : self.padding.left;
      },
      get rangeSelectorWidth() {
        if (self.rangeSelectorWidth === "plot") return self.chartWidth;
        return self.canvas.getBoundingClientRect().width;
      },
      get dataBounds() {
        return self.dataBounds;
      },
      get viewport() {
        return self.lastKnownViewport;
      },
      get showRangeSelector() {
        return self.showRangeSelector;
      },
      get rangeSelectorTop() {
        return self.getRangeSelectorTop();
      },
      get rangeSelectorHeight() {
        return self.rangeSelectorHeight;
      },
      get animated() {
        return self.animated;
      },
      get interactive() {
        return self.interactive;
      },
      get lastTouchTime() {
        return self.lastTouchTime;
      },
      get isMainChartDragging() {
        return self.pointerPanSelect?.isActive ?? false;
      },
      flushViewportInputs() {
        self.flushViewportInputs();
      },
      onViewportManualChange() {
        self.onViewportManualChange();
      },
      applyLegendHoverCursor(x, y) {
        return self.applyLegendHoverCursor(x, y);
      },
    });
  }

  protected onReset(): void {
    // Override in subclass if needed
  }

  /** User callback invoked when the pointer leaves the chart (cleared tooltip).
   *  Subclasses assign their extracted `onLeave` here after `super()`. */
  protected tooltipOnLeave: (() => void) | null = null;

  protected onTooltipLeave(): void {
    this.tooltipOnLeave?.();
  }

  /** Apply main-thread-only tooltip state before a runtime patch is serialized. */
  protected applyTooltipAppearancePatch(patch: Record<string, any>): void {
    if (hasOwn(patch, "onLeave") && patch.onLeave !== undefined) {
      this.tooltipOnLeave = typeof patch.onLeave === "function" ? patch.onLeave : null;
    }
  }

  /**
   * Shared renderer selection used by every chart subclass constructor.
   *
   * Picks worker vs main-thread from `renderMode`/`interactive` + OffscreenCanvas
   * support, then worker-first selects the renderer with a synchronous fallback
   * to the lazily-loaded main-thread engine if worker creation is blocked (e.g.
   * CSP rejects the worker URL). `loadEngineFactory` stays a dynamic import so
   * the renderer engine code-splits out of the worker-mode main bundle.
   *
   * Must be static: subclasses call it before `super()`, where `this` is unavailable.
   */
  protected static selectChartRenderer(
    canvas: HTMLCanvasElement,
    options: {
      renderMode?: "worker" | "main" | "auto";
      interactive?: boolean;
      labels?: ChartLabels;
    },
    createWorker: () => ChartWorkerLike,
    loadEngineFactory: () => Promise<EngineFactory>,
    batchViewportInputs = false,
  ): {
    renderer: RendererFactory;
    useWorker: boolean;
    resolvedRenderMode: "worker" | "main";
  } {
    assertValidChartLabels(options.labels);
    const renderMode = options.renderMode ?? "auto";
    const interactive = options.interactive ?? true;
    const canOffscreen =
      typeof OffscreenCanvas !== "undefined" &&
      typeof canvas.transferControlToOffscreen === "function";
    const wantWorker =
      renderMode === "worker"
        ? canOffscreen
        : renderMode === "main"
          ? false
          : interactive && canOffscreen;

    const selection = selectRenderer(
      wantWorker,
      createWorker,
      () =>
        new DeferredRenderer(async () => {
          const [{ MainThreadRenderer }, factory] = await Promise.all([
            import("./MainThreadRenderer.js"),
            loadEngineFactory(),
          ]);
          return new MainThreadRenderer(factory);
        }),
    );
    if (batchViewportInputs) {
      markViewportInputBatchRenderer(selection.renderer);
    }
    const useWorker = wantWorker && !selection.usedFallback;
    return {
      renderer: () => selection.renderer,
      useWorker,
      resolvedRenderMode: useWorker ? "worker" : "main",
    };
  }

  /** Shared tooltip callback glue: strip non-serializable callbacks from options,
   *  returning the cleaned options and extracted callbacks. */
  protected static stripTooltipCallbacks<T extends { onRender?: unknown; onLeave?: unknown }>(
    tooltip: T | undefined,
  ): {
    cleaned: Omit<T, "onRender" | "onLeave"> & { hasCallback?: boolean };
    onRender: T["onRender"];
    onLeave: T["onLeave"];
  } {
    if (!tooltip) return { cleaned: undefined as any, onRender: undefined, onLeave: undefined };
    const { onRender, onLeave, ...rest } = tooltip;
    return {
      cleaned: { ...rest, ...(onRender ? { hasCallback: true } : {}) } as any,
      onRender,
      onLeave,
    };
  }

  /** Shared tooltip data handler: attach lazy defaults, invoke callback, post result back.
   *  @param data - the tooltipData message payload
   *  @param onRender - the user callback
   *  @param buildDefaults - builds defaults lazily from params (domain-specific)
   *  @param dataXField - which field holds the x-coordinate (e.g. 'dataX' or 'timestamp') */
  protected dispatchTooltipData(
    data: Record<string, any>,
    onRender: (params: any) => TooltipRenderResult,
    buildDefaults: (params: any, defaultTitle: string) => TooltipRenderResult,
    dataXField: string,
  ): void {
    const params = data.params;
    const defaultTitle = data.defaultTitle as string;
    let cachedDefaults: TooltipRenderResult | null = null;
    Object.defineProperty(params, "defaults", {
      get() {
        if (!cachedDefaults) cachedDefaults = buildDefaults(params, defaultTitle);
        return cachedDefaults;
      },
      enumerable: true,
      configurable: true,
    });
    const result = onRender(params);
    this.worker.postMessage({ type: "tooltipContent", content: result, dataX: params[dataXField] });
  }

  protected onViewportManualChange(): void {
    // Override in subclass to handle manual viewport changes (zoom/pan)
  }

  protected getPinchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  protected handleWheel(e: WheelEvent): void {
    if (!this.interactive) return;
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left - this.padding.left;

    const wheelUp = e.deltaY < 0;
    const zoomIn = this.wheelZoomDirection === "up-in" ? wheelUp : !wheelUp;
    const zoomFactor = zoomIn ? 1 - this.wheelZoomSpeed : 1 + this.wheelZoomSpeed;

    this.queueViewportInput({
      type: "zoom",
      factor: zoomFactor,
      centerX: this.screenToDataX(screenX),
    });
    this.onViewportManualChange();
  }

  /**
   * Keep high-frequency pointer input aligned to browser paint cadence.
   *
   * Built-in renderers receive one ordered command batch per frame, which
   * avoids flooding their task queue and emitting viewport sync/render work
   * for every hardware event. Custom BaseChart renderers retain the legacy
   * individual pan/zoom protocol. Built-in commands are replayed individually
   * so boundary clamping retains the same semantics as immediate delivery.
   */
  private queueViewportInput(command: ViewportInputCommand): void {
    if (this.destroyed) return;
    this.pendingViewportInputs.push(command);
    if (this.viewportInputRafId !== null) return;

    this.viewportInputRafId = requestAnimationFrame(() => {
      this.viewportInputRafId = null;
      this.flushViewportInputs();
    });
  }

  protected flushViewportInputs(): void {
    if (this.viewportInputRafId !== null) {
      cancelAnimationFrame(this.viewportInputRafId);
      this.viewportInputRafId = null;
    }
    if (this.destroyed || this.pendingViewportInputs.length === 0) {
      this.pendingViewportInputs.length = 0;
      return;
    }

    const commands = this.pendingViewportInputs;
    this.pendingViewportInputs = [];
    if (supportsViewportInputBatch(this.worker)) {
      this.worker.postMessage({ type: "viewportInputBatch", commands });
      return;
    }
    for (const command of commands) {
      this.worker.postMessage(command);
    }
  }

  protected screenToDataX(screenX: number): number {
    // Before the first non-zero layout chartWidth is 0; dividing would yield
    // Infinity/NaN that gets posted to the renderer as a zoom/pan center.
    if (this.chartWidth <= 0) return this.lastKnownViewport.xMin;
    const xRange = this.lastKnownViewport.xMax - this.lastKnownViewport.xMin;
    return this.lastKnownViewport.xMin + (screenX / this.chartWidth) * xRange;
  }

  protected sendReset(viewportRequestId?: number): void {
    if (this.destroyed) return;
    const animated = this.animated;
    if (this.hasDataBounds) {
      this.lastKnownViewport = { xMin: this.dataBounds.xMin, xMax: this.dataBounds.xMax };
    }
    this.worker.postMessage({
      type: animated ? "resetAnimated" : "reset",
      ...(viewportRequestId === undefined ? {} : { viewportRequestId }),
    });
    this.onReset();
  }

  /** Reserve padding space for edge labels (must match worker's measureLabelSpace) */
  private applyLabelPadding(labels: ChartLabels): void {
    const d = 6; // default padding per side
    if (labels.top?.text) {
      const p = labels.top.padding;
      this.padding.top += (p?.top ?? d) + (labels.top.font?.size ?? 16) + (p?.bottom ?? d);
    }
    if (labels.bottom?.text) {
      const p = labels.bottom.padding;
      this.padding.bottom += (p?.top ?? d) + (labels.bottom.font?.size ?? 12) + (p?.bottom ?? d);
    }
    if (labels.left?.text) {
      const p = labels.left.padding;
      this.padding.left += (p?.left ?? d) + (labels.left.font?.size ?? 12) + (p?.right ?? d);
    }
    if (labels.right?.text) {
      const p = labels.right.padding;
      this.padding.right += (p?.left ?? d) + (labels.right.font?.size ?? 12) + (p?.right ?? d);
    }
  }

  /**
   * Update chart labels at runtime. Merges into existing labels (same semantics
   * as updateAppearance).
   *
   * @throws TypeError for malformed labels or sparse/non-object `custom` entries.
   */
  setLabels(labels: ChartLabels): void {
    if (this.destroyed) return;
    assertValidChartLabels(labels);
    this.flushViewportInputs();
    if (!this.optionsShadow.labels) this.optionsShadow.labels = {};
    deepMerge(this.optionsShadow.labels, labels as Record<string, any>);
    const merged = deepClone(this.optionsShadow.labels) as ChartLabels;
    this.padding = { ...this.paddingBase };
    this.applyLabelPadding(merged);
    this.chartWidth =
      this.canvas.getBoundingClientRect().width - this.padding.left - this.padding.right;
    this.worker.postMessage({ type: "setLabels", labels: merged });
    this.resize();
  }

  /**
   * Update declarative overlay primitives at runtime.
   *
   * Valid primitives and successfully decoded images are installed even when
   * another image fails. If every requested item fails, the previously rendered
   * overlay remains installed. Resolution and renderer-delivery failures reject
   * with {@link ChartOverlayError}; register {@link setOverlayErrorCallback} when
   * the application also needs asynchronous notification. When called before the
   * lazy renderer is ready, this promise includes the readiness wait. Superseded
   * updates and chart destruction are routine cancellation and resolve without
   * installing.
   */
  async setOverlay(overlay: OverlayOptions): Promise<void> {
    if (this.destroyed) return;
    this.flushViewportInputs();
    this.overlayResolutionAbortController?.abort();
    const controller = new AbortController();
    this.overlayResolutionAbortController = controller;
    const version = ++this.overlayVersion;
    let resolution: {
      overlay: OverlayOptions;
      transfer: Transferable[];
      failures: OverlayImageFailure[];
    };
    let filterDetached: (typeof import("./overlay.js"))["filterDetached"] | undefined;
    try {
      if (overlay.items?.some((item) => item?.kind === "image")) {
        const overlayImageResolver = await import("./overlay.js");
        filterDetached = overlayImageResolver.filterDetached;
        resolution = await overlayImageResolver.resolve(
          overlay,
          this.workerTransferEnabled,
          this.allowsDomImageOverlaySources,
          controller.signal,
        );
      } else {
        resolution = { overlay: snapshotOverlay(overlay), transfer: [], failures: [] };
      }
    } catch (error) {
      if (this.overlayResolutionAbortController === controller) {
        this.overlayResolutionAbortController = null;
      }
      if (controller.signal.aborted || this.destroyed || version !== this.overlayVersion) return;
      this.throwOverlayError([{ source: "[overlay]", error }]);
    }
    let resolved = resolution.overlay;
    const { transfer, failures } = resolution;
    if (this.worker instanceof DeferredRenderer && this.readyState === "pending") {
      try {
        await this.initialize();
      } catch (error) {
        closeOwnedOverlayImageSources(resolved);
        if (controller.signal.aborted || this.destroyed || version !== this.overlayVersion) return;
        throw error;
      }
    }
    if (this.destroyed || version !== this.overlayVersion || controller.signal.aborted) {
      closeOwnedOverlayImageSources(resolved);
      return;
    }
    if (this.overlayResolutionAbortController === controller) {
      this.overlayResolutionAbortController = null;
    }
    if (filterDetached) {
      const filtered = filterDetached(resolved);
      resolved = filtered.overlay;
      if (filtered.failures.length > 0) {
        failures.push(...filtered.failures);
      }
    }
    if (failures.length > 0 && resolved.items.length === 0) {
      closeOwnedOverlayImageSources(resolved);
      this.throwOverlayError(failures);
    }
    try {
      this.worker.postMessage(
        { type: "setOverlay", overlay: resolved },
        transfer.length ? transfer : undefined,
      );
    } catch (error) {
      // A synchronous clone/transfer failure leaves internally decoded sources
      // on the host side; they never reached a renderer that could release them.
      closeOwnedOverlayImageSources(resolved);
      failures.push({ source: "[overlay renderer delivery]", error });
      this.throwOverlayError(failures);
    }
    this.optionsShadow.overlay = deepClone(overlay);
    if (failures.length > 0) {
      this.throwOverlayError(failures);
    }
  }

  private resolveOverlayWithoutUnhandledRejection(overlay: OverlayOptions): void {
    void this.setOverlay(overlay).catch(() => {
      // setOverlay reports the failure through setOverlayErrorCallback. This
      // internal path deliberately consumes the matching promise rejection.
    });
  }

  private createOverlayError(failures: readonly OverlayImageFailure[]): ChartOverlayError {
    const sources = failures.map(({ source }) => source);
    const causes = failures.map(({ error }) =>
      error instanceof Error || error instanceof DOMException ? error : new Error(String(error)),
    );
    const cause =
      causes.length === 1 ? causes[0] : new AggregateError(causes, "Chart overlay failed.");
    return new ChartOverlayError(sources, cause);
  }

  private throwOverlayError(failures: readonly OverlayImageFailure[]): never {
    const error = this.createOverlayError(failures);
    this.overlayErrorCallback?.(error);
    throw error;
  }

  // ── Runtime Control API ─────────────────────────────────────────────

  /** Returns the resolved rendering mode ("worker" or "main"). */
  getRenderMode(): "worker" | "main" {
    return this.resolvedRenderMode;
  }

  /** Returns a snapshot of the current viewport. */
  getViewport(): Viewport {
    return {
      xMin: this.lastKnownViewport.xMin,
      xMax: this.lastKnownViewport.xMax,
    };
  }

  /** Returns a full normalized read-only snapshot of all options (construction + current appearance). */
  getOptions(): DeepReadonly<TOptions> {
    return deepClone(this.optionsShadow) as DeepReadonly<TOptions>;
  }

  /** Returns a read-only snapshot of the mutable appearance subset. */
  getAppearance(): DeepReadonly<BaseAppearanceOptions> {
    const s = this.optionsShadow;
    return deepClone({
      tooltip: s.tooltip,
      crosshairStyle: s.crosshairStyle,
      textDirection: s.textDirection,
      grid: s.grid,
      axis: s.axis,
      chartBackground: s.chartBackground,
      selection: s.selection,
      labels: s.labels,
      overlay: s.overlay,
      padding: s.padding,
      rangeSelector: s.rangeSelector,
    }) as DeepReadonly<BaseAppearanceOptions>;
  }

  /**
   * Patch mutable appearance options at runtime.
   *
   * @throws TypeError for malformed labels or sparse/non-object `custom` entries.
   */
  updateAppearance(patch: DeepPartial<BaseAppearanceOptions>): void {
    if (this.destroyed) return;
    assertValidChartLabels(patch.labels);
    this.flushViewportInputs();
    const chartBackgroundUnchanged =
      patch.chartBackground !== undefined &&
      configSnapshotsEqual(this.optionsShadow.chartBackground, patch.chartBackground);
    const overlayUnchanged =
      patch.overlay !== undefined &&
      configSnapshotsEqual(this.optionsShadow.overlay, patch.overlay);
    if (patch.tooltip) {
      this.applyTooltipAppearancePatch(patch.tooltip as Record<string, any>);
    }
    // Update shadow state
    deepMerge(this.optionsShadow, patch as Record<string, any>);
    // Background variants are replacements, not recursively mergeable patches.
    // Replacing the snapshot prevents fields from a prior gradient/image variant
    // from defeating identity-based no-op detection after a type transition.
    if (patch.chartBackground !== undefined) {
      this.optionsShadow.chartBackground = deepClone(patch.chartBackground);
    }
    this.syncRangeSelectorAppearanceState(patch);

    // The renderer's label parser does reset-then-reparse, so send the full merged
    // labels instead of just the patch to avoid dropping unmentioned labels.
    // Keep main-thread delivery consistent with Worker structured-clone
    // semantics. Appearance objects are small control-plane payloads, so a
    // defensive snapshot avoids retaining frozen or subsequently mutated
    // caller objects without touching large chart data buffers.
    const rendererPatch = deepClone(patch as Record<string, any>);
    delete rendererPatch.overlay;
    if (chartBackgroundUnchanged) delete rendererPatch.chartBackground;
    const rendererBackground = rendererPatch.chartBackground;
    if (
      rendererBackground &&
      typeof rendererBackground === "object" &&
      rendererBackground.type === "image" &&
      typeof ImageBitmap !== "undefined" &&
      rendererBackground.image instanceof ImageBitmap
    ) {
      rendererBackground.__sixtyfoldOwnsImageBitmap = true;
      delete rendererBackground.__sixtyfoldHostOwnsImageBitmap;
    }
    if (rendererPatch.tooltip) {
      const tooltipPatch = rendererPatch.tooltip as Record<string, any>;
      const serializableTooltip = { ...tooltipPatch };
      if (hasOwn(tooltipPatch, "onRender") && tooltipPatch.onRender !== undefined) {
        serializableTooltip.hasCallback = typeof tooltipPatch.onRender === "function";
      }
      delete serializableTooltip.onRender;
      delete serializableTooltip.onLeave;
      rendererPatch.tooltip = serializableTooltip;
    }
    if (rendererPatch.labels) {
      rendererPatch.labels = deepClone(this.optionsShadow.labels);
    }

    // Overlay handling: if no image items need URL→ImageBitmap resolution, resolve
    // synchronously so it participates in batch semantics. Otherwise fall back to
    // the async setOverlay pipeline (which can't be batched).
    if (patch.overlay && !overlayUnchanged) {
      const merged = this.optionsShadow.overlay as OverlayOptions;
      if (overlayNeedsAsyncResolution(merged, this.allowsDomImageOverlaySources)) {
        this.resolveOverlayWithoutUnhandledRejection(merged);
      } else {
        // Always snapshot so later batch mutations don't corrupt queued messages.
        const snapshot = snapshotOverlay(merged);
        const sharesBackgroundImage =
          rendererBackground?.type === "image" &&
          snapshot.items.some(
            (item) =>
              item?.kind === "image" && (item as OverlayImageItem).src === rendererBackground.image,
          );
        if (sharesBackgroundImage) {
          // Keep a shared source in one structured-clone graph so the renderer
          // receives one clone and its reference counts remain meaningful.
          rendererPatch.overlay = snapshot;
        } else {
          this.postMessageBatched({ type: "setOverlay", overlay: snapshot });
        }
      }
    }

    // Forward non-empty control-plane work to the renderer. Overlay-only
    // updates already travel through setOverlay above.
    if (Object.keys(rendererPatch).length > 0) {
      this.postMessageBatched({ type: "updateAppearance", patch: rendererPatch });
    }
  }

  private syncRangeSelectorAppearanceState(patch: DeepPartial<BaseAppearanceOptions>): void {
    const rangeSelector = patch.rangeSelector as
      (RangeSelectorAppearanceOptions & Partial<RangeSelectorOptions>) | undefined;
    if (!rangeSelector) return;

    let needsLayout = false;

    if (typeof rangeSelector.visible === "boolean") {
      if (this.showRangeSelector !== rangeSelector.visible) {
        this.showRangeSelector = rangeSelector.visible;
        needsLayout = true;
      }
    }

    if (rangeSelector.width === "plot" || rangeSelector.width === "canvas") {
      this.rangeSelectorWidth = rangeSelector.width;
    }

    if (rangeSelector.position === "top" || rangeSelector.position === "bottom") {
      if (this.rangeSelectorPosition !== rangeSelector.position) {
        this.rangeSelectorPosition = rangeSelector.position;
        needsLayout = true;
      }
    }

    if (
      typeof rangeSelector.height === "number" &&
      Number.isFinite(rangeSelector.height) &&
      rangeSelector.height >= 0 &&
      this.rangeSelectorHeight !== rangeSelector.height
    ) {
      this.rangeSelectorHeight = rangeSelector.height;
      needsLayout = true;
    }

    if (
      typeof rangeSelector.gap === "number" &&
      Number.isFinite(rangeSelector.gap) &&
      rangeSelector.gap >= 0 &&
      this.rangeSelectorGap !== rangeSelector.gap
    ) {
      this.rangeSelectorGap = rangeSelector.gap;
      needsLayout = true;
    }

    if (needsLayout) {
      this.scheduleResize();
    }
  }

  /**
   * Set the viewport range programmatically.
   * Only `xMin` and/or `xMax` need to be provided; omitted fields keep current values.
   */
  setViewport(viewport: Partial<Viewport>, options?: { animated?: boolean }): void {
    if (this.destroyed) return;
    this.flushViewportInputs();
    const animated = options?.animated ?? this.animated;
    const resolvedXMin = viewport.xMin ?? this.lastKnownViewport.xMin;
    const resolvedXMax = viewport.xMax ?? this.lastKnownViewport.xMax;

    // Clamp to data bounds (mirrors renderer logic in baseRenderer.ts).
    // The renderer also rejects ranges below a chart-specific minRange
    // (e.g. 10 for line, 1 hour for stock). We skip the local update
    // when the clamped range collapses so getViewport() doesn't diverge.
    const db = this.dataBounds;
    const clampedMin = Math.max(db.xMin, Math.min(db.xMax, resolvedXMin));
    const clampedMax = Math.max(db.xMin, Math.min(db.xMax, resolvedXMax));
    const lo = Math.min(clampedMin, clampedMax);
    const hi = Math.max(clampedMin, clampedMax);

    // Only update local viewport if the renderer will accept this range.
    // Mirrors the minRange check in baseRenderer's setViewportRange/Animated.
    if (hi > lo && hi - lo >= this.minViewportRange) {
      this.lastKnownViewport = { xMin: lo, xMax: hi };
    }

    if (animated) {
      this.postMessageBatched({
        type: "setViewportRangeAnimated",
        xMin: lo,
        xMax: hi,
      });
    } else {
      const hasXMin = hasOwn(viewport, "xMin");
      const hasXMax = hasOwn(viewport, "xMax");
      const shouldSendResolvedRange = hasXMin && hasXMax && this.hasDataBounds;
      // Instant path supports partial updates natively. Preserve that behavior
      // for omitted fields, but send the locally resolved/clamped range when
      // both bounds are present and data bounds are known so getViewport() and
      // the renderer agree.
      this.postMessageBatched({
        type: "setViewportRange",
        xMin: shouldSendResolvedRange ? lo : viewport.xMin,
        xMax: shouldSendResolvedRange ? hi : viewport.xMax,
      });
    }
  }

  /** Reset the viewport to the full data extent. */
  reset(options?: { animated?: boolean }): void {
    if (this.destroyed) return;
    this.flushViewportInputs();
    const animated = options?.animated ?? this.animated;

    if (this.hasDataBounds) {
      // Update local viewport immediately to full data extent once real data
      // bounds are known.
      this.lastKnownViewport = { xMin: this.dataBounds.xMin, xMax: this.dataBounds.xMax };
    }

    this.postMessageBatched({
      type: animated ? "resetAnimated" : "reset",
    });
    this.onReset();
  }

  /**
   * Batch multiple imperative calls so they produce a single engine update.
   * Synchronous only. Nested batches flatten — only the outermost flush triggers.
   *
   * Bulk data installs are deliberately exempt: setData posts to the renderer
   * immediately, then starts it, so the first frame appears while the derived
   * work still runs in the background. Calling setData inside a batch is
   * therefore safe but not deferred — the queued appearance and viewport
   * messages still flush afterwards, in order.
   */
  batch(fn: () => void): void {
    if (this.destroyed) return;
    // A batch is a new ordered control-plane transaction. Preserve any
    // pointer input that occurred before it as the immediately preceding
    // renderer operation.
    this.flushViewportInputs();
    this.batchDepth++;
    try {
      fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0) {
        this.flushBatchQueue();
      }
    }
  }

  /** Send a message, respecting batch state. Subclasses use this for batched operations. */
  protected postMessageBatched(message: Record<string, any>, transfer?: Transferable[]): void {
    if (this.destroyed) return;
    // Outside an explicit batch, subclass appearance/control mutations must
    // not overtake wheel or pan input queued earlier in the same browser frame.
    if (this.batchDepth === 0) this.flushViewportInputs();
    if (this.batchDepth > 0) {
      this.batchQueue.push({ message, transfer });
    } else {
      this.worker.postMessage(message, transfer);
    }
  }

  /** Queue a side-effect callback. Fires immediately outside batch, deferred inside batch. */
  protected deferInBatch(fn: () => void): void {
    if (this.batchDepth > 0) {
      this.batchCallbacks.push(fn);
    } else {
      fn();
    }
  }

  private flushBatchQueue(): void {
    const queue = this.batchQueue;
    const callbacks = this.batchCallbacks;
    this.batchQueue = [];
    this.batchCallbacks = [];
    if (this.destroyed) return;
    let firstFailure: unknown;
    let failed = false;
    for (const entry of queue) {
      try {
        this.worker.postMessage(entry.message, entry.transfer);
      } catch (error) {
        if (!failed) {
          firstFailure = error;
          failed = true;
        }
      }
    }
    for (const fn of callbacks) {
      try {
        fn();
      } catch (error) {
        if (!failed) {
          firstFailure = error;
          failed = true;
        }
      }
    }
    if (failed) throw firstFailure;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.rejectReady(new DOMException("Destroyed", "AbortError"));
    this.destroyed = true;
    this.overlayVersion++;
    this.overlayResolutionAbortController?.abort();
    this.overlayResolutionAbortController = null;
    this.rendererErrorCallback = null;
    this.overlayErrorCallback = null;
    this.clearRendererInitializationWatchdog();
    this.clearPendingKeyboardViewportAnnouncement();
    this.keyboardAnnouncementRevision++;
    if (this.keyboardAnnouncementWriteTimer !== null) {
      clearTimeout(this.keyboardAnnouncementWriteTimer);
      this.keyboardAnnouncementWriteTimer = null;
    }
    this.keyboardAnnouncementRegion?.remove();
    this.keyboardAnnouncementRegion = null;
    if (this.reducedMotionQuery && this.reducedMotionChangeListener) {
      this.reducedMotionQuery.removeEventListener("change", this.reducedMotionChangeListener);
    }
    this.reducedMotionQuery = null;
    this.reducedMotionChangeListener = null;
    this.worker.postMessage({ type: "stop" });
    this.worker.terminate();
    // Abort all event listeners registered with the signal
    this.eventAbortController.abort();
    this.intersectionObserver?.disconnect();
    this.resizeObserver?.disconnect();
    if (this.resizeRafId !== null) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = null;
    }
    if (this.viewportInputRafId !== null) {
      cancelAnimationFrame(this.viewportInputRafId);
      this.viewportInputRafId = null;
    }
    this.pendingViewportInputs.length = 0;
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }
    if (this.tooltipHideTimer !== null) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    this.pointerPanSelect = null;
    this.tooltipOnLeave = null;
  }
}

/** Compare small declarative config snapshots while retaining identity semantics for leaves. */
function configSnapshotsEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  } else if (!isPlainObject(left) || !isPlainObject(right)) {
    return false;
  }
  // Object.keys visits owned array slots (including explicit undefined) but not
  // holes or inherited numeric properties, so ownership is part of equality.
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every(
      (key) =>
        hasOwn(right, key) &&
        configSnapshotsEqual(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
        ),
    )
  );
}
