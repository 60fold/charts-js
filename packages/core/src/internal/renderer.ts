/**
 * Internal renderer contract shared by the Sixtyfold chart packages.
 *
 * This subpath is not part of the public component API. It deliberately
 * exposes only the primitives required by the independently packaged Line,
 * Stock, and SSR renderers.
 *
 * @internal
 */
export {
  WorkerState,
  applyCanvasTextDirection,
  applyPadding,
  applyStatsConfigFromMessage,
  createStatsState,
  drawAxes,
  drawAxisLabel,
  drawBackground,
  drawCrosshairLines,
  drawCustomLabels,
  drawGrid,
  drawLabels,
  drawMarker,
  drawRangeSelectorOverlay,
  drawSelectionRect,
  formatTooltipTitle,
  formatValue,
  get2dContext,
  getCachedRgba,
  handleBaseMessage,
  handleTooltipContentMessage,
  hasActiveGridAnimations,
  isOpaqueColor,
  isRtlTextDirection,
  measureLabelSpace,
  parseAxisConfig,
  parseAxisCursorUnits,
  parseCrosshairStyle,
  parseGridConfig,
  parseLabelsConfig,
  parseOverlayConfig,
  parseRangeSelectorConfig,
  parseSelectionConfig,
  parseTextDirectionConfig,
  parseTooltipConfig,
  renderTooltipBox,
  replaceChartBackground,
  resetTooltipRatchet,
  resolveCanvasTextAlign,
  savePaddingBase,
  setViewportRangeAnimated,
  setYViewport,
  shouldEmitStats,
  startRevealAnimation,
  updateFPS,
  updateRevealAnimation,
  updateViewportAnimation,
  updateYAnimation,
} from "../rendering/baseRenderer.js";

export type {
  CanvasLike,
  EngineCallbacks,
  RenderContext2D,
  ResolvedTextDirection,
  TooltipContent,
  UnitOptions,
} from "../rendering/baseRenderer.js";

export { createRendererScheduler } from "../rendering/rendererScheduler.js";
export {
  deserializeRendererError,
  serializeRendererError,
} from "../chart/rendererErrorTransport.js";
export type { SerializedRendererError } from "../chart/rendererErrorTransport.js";
