import { POINTER_INTERACTION } from "./pointerInteractionConstants.js";

export interface PointerPanSelectHost {
  readonly canvas: HTMLCanvasElement;
  readonly signal: AbortSignal;
  readonly interactive: boolean;
  readonly lastTouchTime: number;
  readonly chartWidth: number;
  isInMainChart(x: number, y: number): boolean;
  isInXAxisArea(x: number, y: number): boolean;
  isInLegendArea(x: number, y: number): boolean;
  applyLegendHoverCursor(x: number, y: number): boolean;
  startSelection(screenX: number): void;
  updateSelection(screenX: number): void;
  completeSelection(): void;
  sendReset(): void;
  queuePan(dx: number): void;
  flushViewportInputs(): void;
  syncPointer(clientX: number, clientY: number): void;
  onViewportManualChange(): void;
}

export interface PointerPanSelectController {
  readonly isActive: boolean;
  readonly isSelecting: boolean;
  cancel(): void;
}

export function setupPointerPanSelectEvents(
  host: PointerPanSelectHost,
): PointerPanSelectController {
  let isPanning = false;
  let isMouseSelecting = false;
  let isMainChartDragging = false;
  let lastMouseX = 0;
  let lastPointerClientX = 0;
  let lastPointerClientY = 0;

  host.canvas.addEventListener(
    "mousedown",
    (e) => {
      if (!host.interactive) return;
      if (performance.now() - host.lastTouchTime < POINTER_INTERACTION.touchDebounceMs) {
        return;
      }
      if (e.button !== 0) return;

      const rect = host.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      lastPointerClientX = e.clientX;
      lastPointerClientY = e.clientY;

      // Preserve ordering even when the new gesture is a legend activation.
      // The legend click is delivered after this mousedown, so any wheel input
      // queued in the same browser frame must reach the renderer first.
      host.flushViewportInputs();
      if (host.applyLegendHoverCursor(x, y)) return;

      const inXAxisArea = host.isInXAxisArea(x, y);
      const inMainChart = host.isInMainChart(x, y);
      if (!inXAxisArea && !inMainChart) return;

      if (inXAxisArea) {
        isMouseSelecting = true;
        isMainChartDragging = true;
        host.startSelection(x);
        host.canvas.style.cursor = "crosshair";
      } else {
        if (e.shiftKey) {
          isMouseSelecting = true;
          isMainChartDragging = true;
          host.startSelection(x);
          host.canvas.style.cursor = "crosshair";
        } else {
          isPanning = true;
          isMainChartDragging = true;
          lastMouseX = e.clientX;
          host.canvas.style.cursor = "grabbing";
        }
      }
    },
    { signal: host.signal },
  );

  window.addEventListener(
    "mousemove",
    (e) => {
      if (isPanning || isMouseSelecting) {
        lastPointerClientX = e.clientX;
        lastPointerClientY = e.clientY;
      }
      if (isPanning) {
        if (host.chartWidth <= 0) return;
        const dx = (lastMouseX - e.clientX) / host.chartWidth;
        host.queuePan(dx);
        host.onViewportManualChange();
        lastMouseX = e.clientX;
      } else if (isMouseSelecting) {
        const rect = host.canvas.getBoundingClientRect();
        host.updateSelection(e.clientX - rect.left);
      }
    },
    { signal: host.signal },
  );

  window.addEventListener(
    "mouseup",
    () => {
      if (isPanning) {
        host.flushViewportInputs();
        isPanning = false;
        isMainChartDragging = false;
        host.canvas.style.cursor = "default";
        host.syncPointer(lastPointerClientX, lastPointerClientY);
      } else if (isMouseSelecting) {
        isMouseSelecting = false;
        isMainChartDragging = false;
        host.canvas.style.cursor = "default";
        host.completeSelection();
        host.syncPointer(lastPointerClientX, lastPointerClientY);
      }
    },
    { signal: host.signal },
  );

  host.canvas.addEventListener(
    "dblclick",
    (e) => {
      if (!host.interactive) return;
      const rect = host.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (host.isInLegendArea(x, y)) return;
      if (!host.isInMainChart(x, y) && !host.isInXAxisArea(x, y)) return;
      host.sendReset();
    },
    { signal: host.signal },
  );

  return {
    get isActive() {
      return isPanning || isMouseSelecting || isMainChartDragging;
    },
    get isSelecting() {
      return isMouseSelecting;
    },
    cancel() {
      isPanning = false;
      isMouseSelecting = false;
      isMainChartDragging = false;
      host.canvas.style.cursor = "default";
    },
  };
}
