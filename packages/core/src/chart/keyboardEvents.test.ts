/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupKeyboardEvents, type KeyboardInteractionHost } from "./keyboardEvents.js";
import type { ChartWorkerLike } from "./workerInterface.js";

interface HarnessOptions {
  animated?: boolean;
  interactive?: boolean;
  keyboardActivation?: "focus" | "hover";
  hoverKeyboardActive?: boolean;
  isSelecting?: boolean;
}

function createHarness(options: HarnessOptions = {}) {
  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  document.body.append(canvas);

  const messages: Record<string, unknown>[] = [];
  const worker: ChartWorkerLike = {
    onmessage: null,
    postMessage(message: Record<string, unknown>) {
      messages.push(message);
    },
    terminate: vi.fn(),
  };
  const controller = new AbortController();
  const state = {
    hoverKeyboardActive: options.hoverKeyboardActive ?? false,
    isSelecting: options.isSelecting ?? false,
  };
  const flushViewportInputs = vi.fn();
  const sendReset = vi.fn();
  const cancelSelection = vi.fn();
  const onViewportManualChange = vi.fn();
  let viewportRequestSequence = 0;
  const requestKeyboardViewportAnnouncement = vi.fn(() => ++viewportRequestSequence);
  const announceKeyboardAction = vi.fn();
  const host: KeyboardInteractionHost = {
    canvas,
    worker,
    signal: controller.signal,
    interactive: options.interactive ?? true,
    keyboardZoomSpeed: 0.2,
    keyboardPanSpeed: 0.2,
    keyboardActivation: options.keyboardActivation ?? "focus",
    get hoverKeyboardActive() {
      return state.hoverKeyboardActive;
    },
    animated: options.animated ?? false,
    viewport: { xMin: 10, xMax: 30 },
    get isSelecting() {
      return state.isSelecting;
    },
    cancelSelection,
    flushViewportInputs,
    sendReset,
    onViewportManualChange,
    requestKeyboardViewportAnnouncement,
    announceKeyboardAction,
  };

  setupKeyboardEvents(host);
  return {
    canvas,
    messages,
    state,
    controller,
    flushViewportInputs,
    sendReset,
    cancelSelection,
    onViewportManualChange,
    requestKeyboardViewportAnnouncement,
    announceKeyboardAction,
  };
}

function press(
  target: EventTarget,
  key: string,
  options: { shiftKey?: boolean; repeat?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    shiftKey: options.shiftKey,
    repeat: options.repeat,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("setupKeyboardEvents", () => {
  it("maps both arrow keys to ordered pan commands", () => {
    const harness = createHarness();

    const left = press(harness.canvas, "ArrowLeft");
    const right = press(harness.canvas, "ArrowRight");

    expect(left.defaultPrevented).toBe(true);
    expect(right.defaultPrevented).toBe(true);
    expect(harness.messages).toEqual([
      { type: "pan", dx: -0.2, viewportRequestId: 1 },
      { type: "pan", dx: 0.2, viewportRequestId: 2 },
    ]);
    expect(harness.flushViewportInputs).toHaveBeenCalledTimes(2);
    expect(harness.onViewportManualChange).toHaveBeenCalledTimes(2);
    expect(harness.requestKeyboardViewportAnnouncement).toHaveBeenNthCalledWith(1, "panLeft");
    expect(harness.requestKeyboardViewportAnnouncement).toHaveBeenNthCalledWith(2, "panRight");
    harness.controller.abort();
  });

  it("uses animated commands and fine control while Shift is held", () => {
    const harness = createHarness({ animated: true });

    press(harness.canvas, "ArrowRight", { shiftKey: true });
    press(harness.canvas, "+", { shiftKey: true });
    press(harness.canvas, "_", { shiftKey: true });

    expect(harness.messages.map((message) => message.type)).toEqual([
      "panAnimated",
      "zoomAnimated",
      "zoomAnimated",
    ]);
    expect(harness.messages[0]?.dx).toBeCloseTo(0.01);
    expect(harness.messages[0]?.viewportRequestId).toBe(1);
    expect(harness.messages[1]).toMatchObject({
      factor: 0.99,
      centerX: 20,
      viewportRequestId: 2,
    });
    expect(harness.messages[2]).toMatchObject({
      factor: 1.01,
      centerX: 20,
      viewportRequestId: 3,
    });
    expect(harness.requestKeyboardViewportAnnouncement.mock.calls).toEqual([
      ["panRight"],
      ["zoomIn"],
      ["zoomOut"],
    ]);
    harness.controller.abort();
  });

  it("accepts both keyboard aliases for zoom in and zoom out", () => {
    const harness = createHarness();

    for (const key of ["+", "=", "-", "_"]) press(harness.canvas, key);

    expect(harness.messages).toEqual([
      { type: "zoom", factor: 0.8, centerX: 20, viewportRequestId: 1 },
      { type: "zoom", factor: 0.8, centerX: 20, viewportRequestId: 2 },
      { type: "zoom", factor: 1.2, centerX: 20, viewportRequestId: 3 },
      { type: "zoom", factor: 1.2, centerX: 20, viewportRequestId: 4 },
    ]);
    expect(harness.requestKeyboardViewportAnnouncement.mock.calls).toEqual([
      ["zoomIn"],
      ["zoomIn"],
      ["zoomOut"],
      ["zoomOut"],
    ]);
    harness.controller.abort();
  });

  it("resets with Home and cancels an active selection with Escape", () => {
    const harness = createHarness({ isSelecting: true });

    const home = press(harness.canvas, "Home");
    const escape = press(window, "Escape");

    expect(home.defaultPrevented).toBe(true);
    expect(escape.defaultPrevented).toBe(true);
    expect(harness.flushViewportInputs).toHaveBeenCalledOnce();
    expect(harness.sendReset).toHaveBeenCalledOnce();
    expect(harness.sendReset).toHaveBeenCalledWith(1);
    expect(harness.cancelSelection).toHaveBeenCalledOnce();
    expect(harness.requestKeyboardViewportAnnouncement).toHaveBeenCalledWith("reset");
    expect(harness.announceKeyboardAction).toHaveBeenCalledWith("selectionCancelled");
    harness.controller.abort();
  });

  it("keeps repeated navigation responsive without flooding announcements", () => {
    const harness = createHarness();

    press(harness.canvas, "ArrowRight");
    press(harness.canvas, "ArrowRight", { repeat: true });

    expect(harness.messages).toEqual([
      { type: "pan", dx: 0.2, viewportRequestId: 1 },
      { type: "pan", dx: 0.2 },
    ]);
    expect(harness.requestKeyboardViewportAnnouncement).toHaveBeenCalledOnce();
    expect(harness.requestKeyboardViewportAnnouncement).toHaveBeenCalledWith("panRight");
    harness.controller.abort();
  });

  it("supports hover activation without intercepting editable controls", () => {
    const harness = createHarness({
      keyboardActivation: "hover",
      hoverKeyboardActive: true,
    });

    press(document.body, "ArrowRight");

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    press(input, "ArrowRight");

    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    document.body.append(editable);
    press(editable, "ArrowRight");

    expect(harness.messages).toEqual([{ type: "pan", dx: 0.2, viewportRequestId: 1 }]);
    harness.controller.abort();
  });

  it("does not react when interaction is disabled", () => {
    const harness = createHarness({ interactive: false });

    for (const key of ["ArrowLeft", "ArrowRight", "+", "-", "Home"]) {
      press(harness.canvas, key);
    }

    expect(harness.messages).toEqual([]);
    expect(harness.sendReset).not.toHaveBeenCalled();
    expect(harness.requestKeyboardViewportAnnouncement).not.toHaveBeenCalled();
    expect(harness.announceKeyboardAction).not.toHaveBeenCalled();
    harness.controller.abort();
  });
});
