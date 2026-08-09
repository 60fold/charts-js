// Public surface for @sixtyfold/line.
// The renderer engine lives in "@sixtyfold/line/engine" so it code-splits and
// stays out of the main bundle for worker-mode consumers.
export {
  ChartOverlayError,
  ChartRendererError,
  type KeyboardAnnouncementMessages,
  type OverlayErrorCallback,
  type RendererErrorCallback,
  type RendererFailurePhase,
} from "@sixtyfold/core";
export * from "./LineChart.js";
