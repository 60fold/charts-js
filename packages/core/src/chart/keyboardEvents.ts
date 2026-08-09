import type { ChartWorkerLike } from "./workerInterface.js";

const FINE_CONTROL_MULTIPLIER = 0.05;

export type KeyboardChartAction =
  "panLeft" | "panRight" | "zoomIn" | "zoomOut" | "reset" | "selectionCancelled";
export type KeyboardViewportAction = Exclude<KeyboardChartAction, "selectionCancelled">;

export interface KeyboardInteractionHost {
  readonly canvas: HTMLCanvasElement;
  readonly worker: ChartWorkerLike;
  readonly signal: AbortSignal;
  readonly interactive: boolean;
  readonly keyboardZoomSpeed: number;
  readonly keyboardPanSpeed: number;
  readonly keyboardActivation: "focus" | "hover";
  readonly hoverKeyboardActive: boolean;
  readonly animated: boolean;
  readonly viewport: { xMin: number; xMax: number };
  readonly isSelecting: boolean;
  cancelSelection(): void;
  flushViewportInputs(): void;
  sendReset(viewportRequestId?: number): void;
  onViewportManualChange(): void;
  requestKeyboardViewportAnnouncement(action: KeyboardViewportAction): number | undefined;
  announceKeyboardAction(action: KeyboardChartAction): void;
}

export function setupKeyboardEvents(host: KeyboardInteractionHost): void {
  const handleKeyboardNavigation = (e: KeyboardEvent): void => {
    if (!host.interactive) return;

    const fine = e.shiftKey;
    const panStep = fine ? host.keyboardPanSpeed * FINE_CONTROL_MULTIPLIER : host.keyboardPanSpeed;
    const zoomIn = fine
      ? 1 - host.keyboardZoomSpeed * FINE_CONTROL_MULTIPLIER
      : 1 - host.keyboardZoomSpeed;
    const zoomOut = fine
      ? 1 + host.keyboardZoomSpeed * FINE_CONTROL_MULTIPLIER
      : 1 + host.keyboardZoomSpeed;

    const panType = host.animated ? "panAnimated" : "pan";
    const zoomType = host.animated ? "zoomAnimated" : "zoom";

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        host.flushViewportInputs();
        host.worker.postMessage({
          type: panType,
          dx: -panStep,
          ...keyboardViewportRequest(host, e, "panLeft"),
        });
        host.onViewportManualChange();
        break;
      case "ArrowRight":
        e.preventDefault();
        host.flushViewportInputs();
        host.worker.postMessage({
          type: panType,
          dx: panStep,
          ...keyboardViewportRequest(host, e, "panRight"),
        });
        host.onViewportManualChange();
        break;
      case "+":
      case "=":
        e.preventDefault();
        host.flushViewportInputs();
        host.worker.postMessage({
          type: zoomType,
          factor: zoomIn,
          centerX: (host.viewport.xMin + host.viewport.xMax) / 2,
          ...keyboardViewportRequest(host, e, "zoomIn"),
        });
        host.onViewportManualChange();
        break;
      case "-":
      case "_":
        e.preventDefault();
        host.flushViewportInputs();
        host.worker.postMessage({
          type: zoomType,
          factor: zoomOut,
          centerX: (host.viewport.xMin + host.viewport.xMax) / 2,
          ...keyboardViewportRequest(host, e, "zoomOut"),
        });
        host.onViewportManualChange();
        break;
      case "Home":
        e.preventDefault();
        host.flushViewportInputs();
        host.sendReset(e.repeat ? undefined : host.requestKeyboardViewportAnnouncement("reset"));
        break;
    }
  };

  const shouldHandleHoverKeyboardEvent = (e: KeyboardEvent): boolean => {
    if (
      host.keyboardActivation !== "hover" ||
      !host.hoverKeyboardActive ||
      !host.interactive ||
      e.defaultPrevented
    ) {
      return false;
    }

    const target = e.target;
    if (target === host.canvas) return false;

    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (isEditableElement(target) || isEditableElement(activeElement)) {
      return false;
    }

    return true;
  };

  host.canvas.addEventListener("keydown", handleKeyboardNavigation, {
    signal: host.signal,
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (!shouldHandleHoverKeyboardEvent(e)) return;
      handleKeyboardNavigation(e);
    },
    { signal: host.signal },
  );

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && host.isSelecting) {
        e.preventDefault();
        host.cancelSelection();
        host.announceKeyboardAction("selectionCancelled");
      }
    },
    { signal: host.signal },
  );
}

function keyboardViewportRequest(
  host: KeyboardInteractionHost,
  event: KeyboardEvent,
  action: KeyboardViewportAction,
): { viewportRequestId?: number } {
  if (event.repeat) return {};
  const viewportRequestId = host.requestKeyboardViewportAnnouncement(action);
  return viewportRequestId === undefined ? {} : { viewportRequestId };
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
