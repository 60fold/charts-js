// Pointer interaction for the range-selector overview.

import { POINTER_INTERACTION } from "./pointerInteractionConstants.js";
import type { ChartWorkerLike } from "./workerInterface.js";
import { isSafari } from "./chartUtils.js";

// Safari renders the canvas ew-resize cursor inconsistently.
const resizeCursor = isSafari() ? "col-resize" : "ew-resize";

/** Narrow view of BaseChart the range selector needs. Accessors are read at
 *  interaction time, so live geometry/viewport changes are reflected. */
export interface RangeSelectorHost {
  readonly canvas: HTMLCanvasElement;
  readonly worker: ChartWorkerLike;
  readonly signal: AbortSignal;
  readonly rangeSelectorLeft: number;
  readonly rangeSelectorWidth: number;
  readonly dataBounds: { xMin: number; xMax: number };
  readonly viewport: { xMin: number; xMax: number };
  readonly showRangeSelector: boolean;
  readonly rangeSelectorTop: number;
  readonly rangeSelectorHeight: number;
  readonly animated: boolean;
  readonly interactive: boolean;
  readonly lastTouchTime: number;
  readonly isMainChartDragging: boolean;
  flushViewportInputs(): void;
  onViewportManualChange(): void;
  applyLegendHoverCursor(x: number, y: number): boolean;
}

type RangeDragMode = "none" | "left" | "right" | "middle" | "preview";

export function setupRangeSelectorEvents(host: RangeSelectorHost): void {
  const signal = host.signal;

  let rangeDragMode: RangeDragMode = "none";
  let rangeDragStartX = 0;
  let rangeDragStartViewport = { xMin: 0, xMax: 0 };
  let handlesCrossed = false;
  let legendHoverActive = false;

  const hasUsableRangeGeometry = () => {
    const xRange = host.dataBounds.xMax - host.dataBounds.xMin;
    return (
      Number.isFinite(host.rangeSelectorWidth) &&
      host.rangeSelectorWidth > 0 &&
      Number.isFinite(xRange) &&
      xRange > 0
    );
  };

  const getHandlePositions = () => {
    if (!hasUsableRangeGeometry()) return { leftX: 0, rightX: 0 };
    const xRange = host.dataBounds.xMax - host.dataBounds.xMin;

    const leftX =
      host.rangeSelectorLeft +
      ((host.viewport.xMin - host.dataBounds.xMin) / xRange) * host.rangeSelectorWidth;
    const rightX =
      host.rangeSelectorLeft +
      ((host.viewport.xMax - host.dataBounds.xMin) / xRange) * host.rangeSelectorWidth;
    return { leftX, rightX };
  };

  const hitTestRange = (x: number, y: number, isTouch = false): RangeDragMode => {
    if (!host.showRangeSelector) return "none";
    const rangeTop = host.rangeSelectorTop;
    if (y < rangeTop || y > rangeTop + host.rangeSelectorHeight) return "none";
    if (!hasUsableRangeGeometry()) return "none";
    if (x < host.rangeSelectorLeft || x > host.rangeSelectorLeft + host.rangeSelectorWidth)
      return "none";

    const { leftX, rightX } = getHandlePositions();

    if (isTouch) {
      const outer = POINTER_INTERACTION.rangeHandleHitAreaTouch;
      const inner = 20;
      const distLeft = Math.abs(x - leftX);
      const distRight = Math.abs(x - rightX);

      const inLeft = x >= leftX - outer && x <= leftX + inner;
      const inRight = x >= rightX - inner && x <= rightX + outer;

      if (inLeft && inRight) {
        // Overlapping zones on narrow selector — nearest handle wins
        return distLeft <= distRight ? "left" : "right";
      }
      if (inLeft) return "left";
      if (inRight) return "right";
      if (x > leftX + inner && x < rightX - inner) return "middle";
    } else {
      const hit = POINTER_INTERACTION.rangeHandleHitArea;
      if (Math.abs(x - leftX) <= hit) return "left";
      if (Math.abs(x - rightX) <= hit) return "right";
      if (x > leftX + hit && x < rightX - hit) return "middle";
    }

    return "preview";
  };

  const updateCursor = (mode: RangeDragMode) => {
    switch (mode) {
      case "left":
      case "right":
        host.canvas.style.cursor = resizeCursor;
        break;
      case "middle":
        host.canvas.style.cursor = "grab";
        break;
      case "preview":
        host.canvas.style.cursor = "pointer";
        break;
      default:
        host.canvas.style.cursor = "default";
    }
  };

  const moveSelectionTo = (screenX: number): { xMin: number; xMax: number } => {
    if (!hasUsableRangeGeometry()) return { ...host.viewport };

    const xRange = host.dataBounds.xMax - host.dataBounds.xMin;
    const clickedDataX =
      host.dataBounds.xMin +
      ((screenX - host.rangeSelectorLeft) / host.rangeSelectorWidth) * xRange;

    const viewportWidth = host.viewport.xMax - host.viewport.xMin;
    let newXMin = clickedDataX - viewportWidth / 2;
    let newXMax = clickedDataX + viewportWidth / 2;

    if (newXMin < host.dataBounds.xMin) {
      newXMin = host.dataBounds.xMin;
      newXMax = newXMin + viewportWidth;
    }
    if (newXMax > host.dataBounds.xMax) {
      newXMax = host.dataBounds.xMax;
      newXMin = newXMax - viewportWidth;
    }

    const rangeType = host.animated ? "setViewportRangeAnimated" : "setViewportRange";
    host.worker.postMessage({
      type: rangeType,
      xMin: newXMin,
      xMax: newXMax,
      interactionSource: "rangeSelector",
    });
    host.onViewportManualChange();
    return { xMin: newXMin, xMax: newXMax };
  };

  const handleDrag = (x: number) => {
    if (!hasUsableRangeGeometry()) return;
    host.flushViewportInputs();

    const deltaX = x - rangeDragStartX;
    const xRange = host.dataBounds.xMax - host.dataBounds.xMin;
    const deltaData = (deltaX / host.rangeSelectorWidth) * xRange;

    if (rangeDragMode === "left") {
      const newPos = rangeDragStartViewport.xMin + deltaData;
      const clampedPos = Math.max(host.dataBounds.xMin, Math.min(host.dataBounds.xMax, newPos));
      const crossed = clampedPos > rangeDragStartViewport.xMax;
      if (crossed !== handlesCrossed) {
        // Transition frame: send both to pin the anchor on the correct side
        handlesCrossed = crossed;
        host.worker.postMessage({
          type: "setViewportRange",
          xMin: crossed ? rangeDragStartViewport.xMax : clampedPos,
          xMax: crossed ? clampedPos : rangeDragStartViewport.xMax,
          interactionSource: "rangeSelector",
        });
      } else {
        host.worker.postMessage({
          type: "setViewportRange",
          [crossed ? "xMax" : "xMin"]: clampedPos,
          interactionSource: "rangeSelector",
        });
      }
    } else if (rangeDragMode === "right") {
      const newPos = rangeDragStartViewport.xMax + deltaData;
      const clampedPos = Math.max(host.dataBounds.xMin, Math.min(host.dataBounds.xMax, newPos));
      const crossed = clampedPos < rangeDragStartViewport.xMin;
      if (crossed !== handlesCrossed) {
        handlesCrossed = crossed;
        host.worker.postMessage({
          type: "setViewportRange",
          xMin: crossed ? clampedPos : rangeDragStartViewport.xMin,
          xMax: crossed ? rangeDragStartViewport.xMin : clampedPos,
          interactionSource: "rangeSelector",
        });
      } else {
        host.worker.postMessage({
          type: "setViewportRange",
          [crossed ? "xMin" : "xMax"]: clampedPos,
          interactionSource: "rangeSelector",
        });
      }
    } else if (rangeDragMode === "middle") {
      const viewportWidth = rangeDragStartViewport.xMax - rangeDragStartViewport.xMin;
      let newXMin = rangeDragStartViewport.xMin + deltaData;
      let newXMax = rangeDragStartViewport.xMax + deltaData;

      if (newXMin < host.dataBounds.xMin) {
        newXMin = host.dataBounds.xMin;
        newXMax = newXMin + viewportWidth;
      }
      if (newXMax > host.dataBounds.xMax) {
        newXMax = host.dataBounds.xMax;
        newXMin = newXMax - viewportWidth;
      }
      host.worker.postMessage({
        type: "setViewportRange",
        xMin: newXMin,
        xMax: newXMax,
        interactionSource: "rangeSelector",
      });
    }
    host.onViewportManualChange();
  };

  // Mouse events
  host.canvas.addEventListener(
    "mousedown",
    (e) => {
      if (e.button !== 0) return;
      if (!host.interactive) return;
      // Ignore synthetic mouse events after recent touch
      if (performance.now() - host.lastTouchTime < POINTER_INTERACTION.touchDebounceMs) {
        return;
      }

      const rect = host.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const mode = hitTestRange(x, y);
      if (mode === "preview") {
        e.preventDefault();
        host.flushViewportInputs();
        host.canvas.focus();
        const targetViewport = moveSelectionTo(x);
        rangeDragMode = "middle";
        rangeDragStartX = x;
        handlesCrossed = false;
        rangeDragStartViewport = targetViewport;
        host.canvas.style.cursor = "grabbing";
      } else if (mode !== "none") {
        e.preventDefault();
        host.flushViewportInputs();
        host.canvas.focus();
        rangeDragMode = mode;
        rangeDragStartX = x;
        handlesCrossed = false;
        rangeDragStartViewport = { ...host.viewport };
        if (mode === "middle") {
          host.canvas.style.cursor = "grabbing";
        }
      }
    },
    { signal },
  );

  window.addEventListener(
    "mousemove",
    (e) => {
      if (rangeDragMode === "none") return;

      const rect = host.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      e.preventDefault();
      handleDrag(x);
    },
    { signal },
  );

  host.canvas.addEventListener(
    "mousemove",
    (e) => {
      if (host.isMainChartDragging || rangeDragMode !== "none") return;

      const rect = host.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (host.applyLegendHoverCursor(x, y)) {
        legendHoverActive = true;
        return;
      }

      if (legendHoverActive) {
        legendHoverActive = false;
        host.canvas.style.cursor = "default";
      }
      if (!host.interactive) return;

      const mode = hitTestRange(x, y);
      updateCursor(mode);
    },
    { signal },
  );

  host.canvas.addEventListener(
    "mouseleave",
    () => {
      if (!legendHoverActive) return;
      legendHoverActive = false;
      host.canvas.style.cursor = "default";
    },
    { signal },
  );

  window.addEventListener(
    "mouseup",
    () => {
      if (rangeDragMode !== "none") {
        rangeDragMode = "none";
        host.canvas.style.cursor = "default";
      }
    },
    { signal },
  );

  // Touch events
  host.canvas.addEventListener(
    "touchstart",
    (e) => {
      if (!host.interactive) return;
      if (e.touches.length !== 1) return;

      const rect = host.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      const mode = hitTestRange(x, y, true);
      if (mode === "preview") {
        e.preventDefault();
        host.flushViewportInputs();
        host.canvas.focus();
        const targetViewport = moveSelectionTo(x);
        rangeDragMode = "middle";
        rangeDragStartX = x;
        handlesCrossed = false;
        rangeDragStartViewport = targetViewport;
      } else if (mode !== "none") {
        e.preventDefault();
        host.flushViewportInputs();
        host.canvas.focus();
        rangeDragMode = mode;
        rangeDragStartX = x;
        handlesCrossed = false;
        rangeDragStartViewport = { ...host.viewport };
      }
    },
    { passive: !host.interactive, signal },
  );

  host.canvas.addEventListener(
    "touchmove",
    (e) => {
      if (rangeDragMode === "none" || e.touches.length !== 1) return;

      e.preventDefault();
      const rect = host.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;

      handleDrag(x);
    },
    { passive: !host.interactive, signal },
  );

  host.canvas.addEventListener(
    "touchend",
    () => {
      rangeDragMode = "none";
    },
    { signal },
  );
}
