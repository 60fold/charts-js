/**
 * @vitest-environment jsdom
 *
 * Characterization tests for the range-selector drag interaction. These lock in
 * the observable behavior (worker messages + cursor) so the logic can be safely
 * extracted out of BaseChart without changing what it does.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseChart, type BaseChartOptions } from "./BaseChart";
import { markViewportInputBatchRenderer } from "./internalRendererCapabilities";
import type { ChartWorkerLike } from "./workerInterface";

const WIDTH = 800;
const HEIGHT = 400;

function createCanvas(width = WIDTH, height = HEIGHT): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        width,
        height,
        toJSON: () => ({}),
      }) as DOMRect,
  });
  return canvas;
}

function createWorkerStub(): { worker: ChartWorkerLike; messages: Record<string, any>[] } {
  const messages: Record<string, any>[] = [];
  const worker: ChartWorkerLike = {
    onmessage: null,
    postMessage: (message: Record<string, any>) => {
      messages.push(message);
    },
    terminate: vi.fn(),
  };
  return { worker, messages };
}

function installAnimationFrameHarness(): {
  pending(): number;
} {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => {
      callbacks.delete(id);
    }),
  );
  return {
    pending() {
      return callbacks.size;
    },
  };
}

class TestChart extends BaseChart {
  constructor(canvas: HTMLCanvasElement, worker: ChartWorkerLike, options: BaseChartOptions = {}) {
    markViewportInputBatchRenderer(worker);
    super(canvas, () => worker, options, {}, false);
  }

  protected handleWorkerMessage(_e: MessageEvent): void {}

  /** Force usable range-selector geometry, normally set via the layout message. */
  setGeometry(
    chartWidth: number,
    dataBounds: { xMin: number; xMax: number },
    viewport: { xMin: number; xMax: number },
  ): void {
    this.chartWidth = chartWidth;
    this.dataBounds = dataBounds;
    this.lastKnownViewport = viewport;
  }

  setLegendInteraction(
    hitboxes: Array<{ x: number; y: number; width: number; height: number }>,
  ): void {
    this.syncLegendInteractionFromRenderer({
      legendInteractive: true,
      legendHitboxes: hitboxes,
    });
  }
}

// Geometry shared across tests:
//   padding.left = 80, chartWidth = 640, dataBounds = [0, 1000], viewport = [200, 400]
//   => leftX = 80 + (200/1000)*640 = 208, rightX = 80 + (400/1000)*640 = 336
//   range band (bottom, RANGE_HEIGHT=60) is y in [340, 400]; use y = 360
function makeChart(options: BaseChartOptions = {}) {
  const canvas = createCanvas();
  const { worker, messages } = createWorkerStub();
  const chart = new TestChart(canvas, worker, { interactive: true, ...options });
  chart.setGeometry(640, { xMin: 0, xMax: 1000 }, { xMin: 200, xMax: 400 });
  messages.length = 0;
  return { canvas, worker, messages, chart };
}

function mousedown(canvas: HTMLCanvasElement, x: number, y: number, button = 0) {
  canvas.dispatchEvent(
    new MouseEvent("mousedown", {
      clientX: x,
      clientY: y,
      button,
      buttons: button === 0 ? 1 : 2,
      bubbles: true,
      cancelable: true,
    }),
  );
}
function windowMouseMove(x: number, y: number) {
  window.dispatchEvent(
    new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true, cancelable: true }),
  );
}
function canvasMouseMove(canvas: HTMLCanvasElement, x: number, y: number) {
  canvas.dispatchEvent(
    new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true, cancelable: true }),
  );
}
function lastOfType(messages: Record<string, any>[], type: string): Record<string, any> | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.type === type) return messages[i];
  }
  return null;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BaseChart range selector", () => {
  it("preserves author accessibility and fallback content", () => {
    const canvas = createCanvas();
    canvas.setAttribute("aria-label", "Revenue over time");
    canvas.setAttribute("role", "figure");
    canvas.setAttribute("tabindex", "-1");
    canvas.textContent = "Existing fallback";
    const { worker } = createWorkerStub();
    const chart = new TestChart(canvas, worker);

    expect(canvas.tabIndex).toBe(-1);
    expect(canvas.getAttribute("role")).toBe("figure");
    expect(canvas.getAttribute("aria-label")).toBe("Revenue over time");
    expect(canvas.textContent).toBe("Existing fallback");
    expect(canvas.style.outline).toBe("");

    chart.destroy();
  });

  it("uses application semantics for an interactive unlabelled canvas", () => {
    const canvas = createCanvas();
    const { worker } = createWorkerStub();
    const chart = new TestChart(canvas, worker);

    expect(canvas.getAttribute("role")).toBe("application");
    expect(canvas.getAttribute("tabindex")).toBe("0");
    expect(canvas.getAttribute("aria-label")).toBe("Interactive chart");
    expect(canvas.textContent).toBe("");
    expect(canvas.style.touchAction).toBe("none");

    chart.destroy();
  });

  it("uses non-focusable image semantics for a view-only canvas", () => {
    const canvas = createCanvas();
    canvas.setAttribute("aria-labelledby", "chart-heading");
    canvas.style.touchAction = "pan-y";
    const { worker } = createWorkerStub();
    const chart = new TestChart(canvas, worker, { interactive: false });

    expect(canvas.getAttribute("role")).toBe("img");
    expect(canvas.hasAttribute("tabindex")).toBe(false);
    expect(canvas.hasAttribute("aria-label")).toBe(false);
    expect(canvas.getAttribute("aria-labelledby")).toBe("chart-heading");
    expect(canvas.style.touchAction).toBe("pan-y");

    chart.destroy();
  });

  it.each([
    { interactive: true, passive: false },
    { interactive: false, passive: true },
  ])(
    "registers wheel and touch listeners with passive=$passive when interactive=$interactive",
    ({ interactive, passive }) => {
      const canvas = createCanvas();
      const addEventListener = vi.spyOn(canvas, "addEventListener");
      const { worker } = createWorkerStub();
      const chart = new TestChart(canvas, worker, { interactive });

      for (const eventType of ["wheel", "touchstart", "touchmove"]) {
        const options = addEventListener.mock.calls
          .filter(([type]) => type === eventType)
          .map(([, , value]) => value)
          .filter((value): value is AddEventListenerOptions => typeof value === "object");
        expect(options.length).toBeGreaterThan(0);
        expect(options.every((value) => value.passive === passive)).toBe(true);
      }

      chart.destroy();
    },
  );

  it("drags the middle (pan) to a new viewport range", () => {
    const { canvas, messages, chart } = makeChart();
    expect(chart.getOptions().rangeSelector?.width).toBe("plot");
    // x=272 is between the handles (208..336) → "middle"
    mousedown(canvas, 272, 360);
    // move +64px => deltaData = (64/640)*1000 = 100 => [300, 500]
    windowMouseMove(336, 360);

    const msg = lastOfType(messages, "setViewportRange");
    expect(msg).not.toBeNull();
    expect(msg!.xMin).toBeCloseTo(300);
    expect(msg!.xMax).toBeCloseTo(500);
    expect(msg!.interactionSource).toBe("rangeSelector");
    chart.destroy();
  });

  it("flushes first-interaction wheel input before any touch timestamp exists", () => {
    vi.spyOn(performance, "now").mockReturnValue(1);
    const frames = installAnimationFrameHarness();
    const { canvas, messages, chart } = makeChart({ animated: false });

    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -120,
        clientX: 200,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(messages).toEqual([]);
    expect(frames.pending()).toBe(1);

    mousedown(canvas, 272, 360);
    expect(frames.pending()).toBe(0);
    expect(messages.map((message) => message.type)).toEqual(["viewportInputBatch"]);

    messages.length = 0;
    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -120,
        clientX: 240,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(frames.pending()).toBe(1);
    windowMouseMove(336, 360);
    expect(frames.pending()).toBe(0);
    expect(messages.map((message) => message.type)).toEqual([
      "viewportInputBatch",
      "setViewportRange",
    ]);
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    chart.destroy();
  });

  it("drags the left handle, moving only xMin", () => {
    const { canvas, messages, chart } = makeChart();
    mousedown(canvas, 208, 360); // left handle
    windowMouseMove(272, 360); // +64px => +100 data => xMin 200 -> 300

    const msg = lastOfType(messages, "setViewportRange");
    expect(msg).not.toBeNull();
    expect(msg!.xMin).toBeCloseTo(300);
    expect(msg!.xMax).toBeUndefined();
    chart.destroy();
  });

  it("drags the right handle, moving only xMax", () => {
    const { canvas, messages, chart } = makeChart();
    mousedown(canvas, 336, 360); // right handle
    windowMouseMove(400, 360); // +64px => +100 data => xMax 400 -> 500

    const msg = lastOfType(messages, "setViewportRange");
    expect(msg).not.toBeNull();
    expect(msg!.xMax).toBeCloseTo(500);
    expect(msg!.xMin).toBeUndefined();
    chart.destroy();
  });

  it("clicking the preview area recenters the viewport (animated)", () => {
    const { canvas, messages, chart } = makeChart();
    // x=600 is in band, away from handles → "preview"
    // clickedDataX = ((600-80)/640)*1000 = 812.5; width 200 => [712.5, 912.5]
    mousedown(canvas, 600, 360);

    const msg = lastOfType(messages, "setViewportRangeAnimated");
    expect(msg).not.toBeNull();
    expect(msg!.xMin).toBeCloseTo(712.5);
    expect(msg!.xMax).toBeCloseTo(912.5);
    expect(msg!.interactionSource).toBe("rangeSelector");
    chart.destroy();
  });

  it("maps canvas-width previews across the full horizontal extent", () => {
    const { canvas, messages, chart } = makeChart({
      rangeSelector: { width: "canvas" },
    });
    // x=40 is outside the ordinary plot-aligned selector but inside the
    // edge-to-edge preview. It maps to data x=50 and clamps [−50, 150] to [0, 200].
    mousedown(canvas, 40, 360);

    const msg = lastOfType(messages, "setViewportRangeAnimated");
    expect(msg).not.toBeNull();
    expect(msg!.xMin).toBeCloseTo(0);
    expect(msg!.xMax).toBeCloseTo(200);
    chart.destroy();
  });

  it("updates the preview width mode at runtime", () => {
    const { canvas, messages, chart } = makeChart();

    chart.updateAppearance({ rangeSelector: { width: "canvas" } });
    messages.length = 0;
    mousedown(canvas, 40, 360);

    const msg = lastOfType(messages, "setViewportRangeAnimated");
    expect(msg).not.toBeNull();
    expect(msg!.xMin).toBeCloseTo(0);
    expect(msg!.xMax).toBeCloseTo(200);
    chart.destroy();
  });

  it("sets a grab cursor when hovering the middle band (no drag)", () => {
    const { canvas, chart } = makeChart();
    canvasMouseMove(canvas, 272, 360); // hover middle, no mousedown
    expect(canvas.style.cursor).toBe("grab");
    chart.destroy();
  });

  it("shows the pointer cursor for an interactive legend on a view-only chart", () => {
    const canvas = createCanvas();
    const { worker } = createWorkerStub();
    const chart = new TestChart(canvas, worker, { interactive: false });
    chart.setLegendInteraction([{ x: 100, y: 20, width: 80, height: 24 }]);

    canvasMouseMove(canvas, 120, 30);
    expect(canvas.style.cursor).toBe("pointer");

    canvas.dispatchEvent(new MouseEvent("mouseleave"));
    expect(canvas.style.cursor).toBe("default");
    chart.destroy();
  });

  it("switches directly from a legend cursor to a range-handle cursor", () => {
    const { canvas, chart } = makeChart();
    chart.setLegendInteraction([{ x: 100, y: 20, width: 80, height: 24 }]);

    canvasMouseMove(canvas, 120, 30);
    expect(canvas.style.cursor).toBe("pointer");

    canvasMouseMove(canvas, 208, 360);
    expect(["ew-resize", "col-resize"]).toContain(canvas.style.cursor);
    chart.destroy();
  });

  it("does not inspect idle interactive charts on document mouse movement", () => {
    const { canvas, chart } = makeChart();
    const bounds = vi.spyOn(canvas, "getBoundingClientRect");
    const callsBeforeMove = bounds.mock.calls.length;

    windowMouseMove(272, 360);

    expect(bounds).toHaveBeenCalledTimes(callsBeforeMove);
    chart.destroy();
  });

  it("does not inspect or restyle view-only charts on document mouse movement", () => {
    const canvas = createCanvas();
    canvas.style.cursor = "crosshair";
    const bounds = vi.spyOn(canvas, "getBoundingClientRect");
    const { worker } = createWorkerStub();
    const chart = new TestChart(canvas, worker, { interactive: false });
    const callsBeforeMove = bounds.mock.calls.length;

    windowMouseMove(272, 360);

    expect(bounds).toHaveBeenCalledTimes(callsBeforeMove);
    expect(canvas.style.cursor).toBe("crosshair");
    chart.destroy();
  });

  it("does not emit range messages outside the selector band", () => {
    const { canvas, messages, chart } = makeChart();
    mousedown(canvas, 272, 100); // y=100 is in the main chart, not the band
    windowMouseMove(336, 100);
    expect(lastOfType(messages, "setViewportRange")).toBeNull();
    expect(lastOfType(messages, "setViewportRangeAnimated")).toBeNull();
    chart.destroy();
  });

  it("activates selector interactions after runtime visibility is enabled", () => {
    const { canvas, messages, chart } = makeChart({
      rangeSelector: { visible: false },
    });

    chart.updateAppearance({ rangeSelector: { visible: true } });
    messages.length = 0;

    mousedown(canvas, 272, 360);
    windowMouseMove(336, 360);

    const msg = lastOfType(messages, "setViewportRange");
    expect(msg).not.toBeNull();
    expect(msg!.xMin).toBeCloseTo(300);
    expect(msg!.xMax).toBeCloseTo(500);
    chart.destroy();
  });

  it("disables selector hit-testing after runtime visibility is disabled", () => {
    const { canvas, messages, chart } = makeChart();

    chart.updateAppearance({ rangeSelector: { visible: false } });
    messages.length = 0;

    mousedown(canvas, 272, 360);
    windowMouseMove(336, 360);

    expect(lastOfType(messages, "setViewportRange")).toBeNull();
    expect(lastOfType(messages, "setViewportRangeAnimated")).toBeNull();
    chart.destroy();
  });

  it("does not start range drags from non-primary mouse buttons", () => {
    const { canvas, messages, chart } = makeChart();

    mousedown(canvas, 272, 360, 2);
    windowMouseMove(336, 360);

    expect(lastOfType(messages, "setViewportRange")).toBeNull();
    expect(lastOfType(messages, "setViewportRangeAnimated")).toBeNull();
    chart.destroy();
  });
});
