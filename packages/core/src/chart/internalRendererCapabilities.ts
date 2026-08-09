import type { ChartWorkerLike } from "./workerInterface.js";

/**
 * Renderers created by Sixtyfold itself understand private control-plane
 * transports that are deliberately not part of ChartWorkerLike.
 *
 * Keep the registry internal to the package: custom BaseChart renderers
 * continue to receive stable legacy messages unless they came through the
 * built-in renderer selector.
 */
const viewportInputBatchRenderers = new WeakSet<ChartWorkerLike>();

export function markViewportInputBatchRenderer<T extends ChartWorkerLike>(renderer: T): T {
  viewportInputBatchRenderers.add(renderer);
  return renderer;
}

export function supportsViewportInputBatch(renderer: ChartWorkerLike): boolean {
  return viewportInputBatchRenderers.has(renderer);
}
