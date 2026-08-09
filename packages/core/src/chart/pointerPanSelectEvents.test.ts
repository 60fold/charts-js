/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupPointerPanSelectEvents, type PointerPanSelectHost } from "./pointerPanSelectEvents";

function createHarness(interactive = true): {
  canvas: HTMLCanvasElement;
  controller: ReturnType<typeof setupPointerPanSelectEvents>;
  host: PointerPanSelectHost;
} {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () =>
      ({
        x: 10,
        y: 20,
        top: 20,
        left: 10,
        right: 810,
        bottom: 420,
        width: 800,
        height: 400,
        toJSON: () => ({}),
      }) as DOMRect,
  });
  const abortController = new AbortController();
  const host: PointerPanSelectHost = {
    canvas,
    signal: abortController.signal,
    interactive,
    lastTouchTime: Number.NEGATIVE_INFINITY,
    chartWidth: 800,
    isInMainChart: vi.fn((_x, y) => y < 300),
    isInXAxisArea: vi.fn((_x, y) => y >= 300 && y < 360),
    isInLegendArea: vi.fn(() => false),
    applyLegendHoverCursor: vi.fn(() => false),
    startSelection: vi.fn(),
    updateSelection: vi.fn(),
    completeSelection: vi.fn(),
    sendReset: vi.fn(),
    queuePan: vi.fn(),
    flushViewportInputs: vi.fn(),
    syncPointer: vi.fn(),
    onViewportManualChange: vi.fn(),
  };
  return {
    canvas,
    host,
    controller: setupPointerPanSelectEvents(host),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pointer pan and selection", () => {
  it("does not capture pointer input for a view-only chart", () => {
    const { canvas, controller, host } = createHarness(false);
    const down = new MouseEvent("mousedown", {
      button: 0,
      clientX: 200,
      clientY: 100,
      bubbles: true,
      cancelable: true,
    });

    canvas.dispatchEvent(down);
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 100, clientY: 100, bubbles: true }),
    );
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    canvas.dispatchEvent(
      new MouseEvent("dblclick", {
        clientX: 200,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(down.defaultPrevented).toBe(false);
    expect(controller.isActive).toBe(false);
    expect(canvas.style.cursor).toBe("");
    expect(host.flushViewportInputs).not.toHaveBeenCalled();
    expect(host.queuePan).not.toHaveBeenCalled();
    expect(host.startSelection).not.toHaveBeenCalled();
    expect(host.sendReset).not.toHaveBeenCalled();
  });

  it("pans, flushes, and resynchronizes the pointer at gesture end", () => {
    const { canvas, controller, host } = createHarness();

    canvas.dispatchEvent(
      new MouseEvent("mousedown", {
        button: 0,
        clientX: 410,
        clientY: 120,
        bubbles: true,
      }),
    );
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 330, clientY: 140, bubbles: true }),
    );

    expect(controller.isActive).toBe(true);
    expect(canvas.style.cursor).toBe("grabbing");
    expect(host.flushViewportInputs).toHaveBeenCalledTimes(1);
    expect(host.queuePan).toHaveBeenCalledWith(0.1);
    expect(host.onViewportManualChange).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    expect(controller.isActive).toBe(false);
    expect(canvas.style.cursor).toBe("default");
    expect(host.flushViewportInputs).toHaveBeenCalledTimes(2);
    expect(host.syncPointer).toHaveBeenCalledWith(330, 140);
  });

  it.each([
    ["the X-axis", 330, false],
    ["shift-drag in the plot", 120, true],
  ])("completes a selection started from %s", (_label, clientY, shiftKey) => {
    const { canvas, controller, host } = createHarness();

    canvas.dispatchEvent(
      new MouseEvent("mousedown", {
        button: 0,
        clientX: 210,
        clientY,
        shiftKey,
        bubbles: true,
      }),
    );
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 510, clientY, bubbles: true }));

    expect(controller.isSelecting).toBe(true);
    expect(host.startSelection).toHaveBeenCalledWith(200);
    expect(host.updateSelection).toHaveBeenCalledWith(500);

    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    expect(controller.isSelecting).toBe(false);
    expect(host.completeSelection).toHaveBeenCalledTimes(1);
    expect(host.syncPointer).toHaveBeenCalledWith(510, clientY);
  });

  it("resets only for double-clicks in chart interaction areas", () => {
    const { canvas, host } = createHarness();

    canvas.dispatchEvent(new MouseEvent("dblclick", { clientX: 200, clientY: 390, bubbles: true }));
    expect(host.sendReset).not.toHaveBeenCalled();

    canvas.dispatchEvent(new MouseEvent("dblclick", { clientX: 200, clientY: 120, bubbles: true }));
    expect(host.sendReset).toHaveBeenCalledTimes(1);
  });
});
