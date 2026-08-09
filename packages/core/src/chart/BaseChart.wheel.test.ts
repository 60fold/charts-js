/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseChart, type BaseChartOptions } from "./BaseChart";
import { markViewportInputBatchRenderer } from "./internalRendererCapabilities";
import type { ChartWorkerLike } from "./workerInterface";

function createCanvas(width = 800, height = 400): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "getBoundingClientRect", {
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
  flush(): void;
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
    flush() {
      const frame = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of frame) callback(16);
    },
    pending() {
      return callbacks.size;
    },
  };
}

class TestChart extends BaseChart {
  constructor(
    canvas: HTMLCanvasElement,
    worker: ChartWorkerLike,
    options: BaseChartOptions = {},
    supportsInputBatch = true,
  ) {
    if (supportsInputBatch) markViewportInputBatchRenderer(worker);
    super(canvas, () => worker, options, {}, false);
  }

  protected handleWorkerMessage(_e: MessageEvent): void {}
}

function getLatestZoomFactor(messages: Record<string, any>[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.type === "zoom") {
      return messages[i].factor as number;
    }
    if (messages[i]?.type === "viewportInputBatch") {
      const commands = messages[i].commands as Record<string, any>[];
      for (let j = commands.length - 1; j >= 0; j--) {
        if (commands[j]?.type === "zoom") return commands[j].factor as number;
      }
    }
  }
  return null;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BaseChart wheel zoom direction", () => {
  it("leaves wheel input untouched when the chart is view-only", () => {
    const frames = installAnimationFrameHarness();
    const canvas = createCanvas();
    const { worker, messages } = createWorkerStub();
    const chart = new TestChart(canvas, worker, { interactive: false });

    messages.length = 0;
    const event = new WheelEvent("wheel", {
      deltaY: -120,
      clientX: 100,
      clientY: 100,
      bubbles: true,
      cancelable: true,
    });

    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(frames.pending()).toBe(0);
    expect(messages).toEqual([]);
    chart.destroy();
  });

  it("uses up-in by default (wheel up/backward zooms in)", () => {
    const frames = installAnimationFrameHarness();
    const canvas = createCanvas();
    const { worker, messages } = createWorkerStub();
    const chart = new TestChart(canvas, worker, { interactive: true, wheelZoomSpeed: 0.2 });

    messages.length = 0;
    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -120,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
    frames.flush();

    expect(getLatestZoomFactor(messages)).toBeCloseTo(0.8);
    chart.destroy();
  });

  it("supports inverted wheel mode (up-out)", () => {
    const frames = installAnimationFrameHarness();
    const canvas = createCanvas();
    const { worker, messages } = createWorkerStub();
    const chart = new TestChart(canvas, worker, {
      interactive: true,
      wheelZoomSpeed: 0.2,
      wheelZoomDirection: "up-out",
    });

    messages.length = 0;
    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -120,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
    frames.flush();

    expect(getLatestZoomFactor(messages)).toBeCloseTo(1.2);
    chart.destroy();
  });

  it("posts one ordered viewport batch for wheel events in the same frame", () => {
    const frames = installAnimationFrameHarness();
    const canvas = createCanvas();
    const { worker, messages } = createWorkerStub();
    const chart = new TestChart(canvas, worker, {
      interactive: true,
      wheelZoomSpeed: 0.2,
    });

    messages.length = 0;
    for (const [deltaY, clientX] of [
      [-120, 100],
      [-120, 300],
      [120, 500],
    ] as const) {
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY,
          clientX,
          clientY: 100,
          bubbles: true,
          cancelable: true,
        }),
      );
    }

    expect(messages).toEqual([]);
    expect(frames.pending()).toBe(1);
    frames.flush();

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      type: "viewportInputBatch",
      commands: [
        { type: "zoom", factor: 0.8, centerX: 0.03125 },
        { type: "zoom", factor: 0.8, centerX: 0.34375 },
        { type: "zoom", factor: 1.2, centerX: 0.65625 },
      ],
    });
    chart.destroy();
  });

  it("preserves legacy individual messages for an unmarked custom renderer", () => {
    const frames = installAnimationFrameHarness();
    const canvas = createCanvas();
    const { worker, messages } = createWorkerStub();
    const chart = new TestChart(canvas, worker, { interactive: true, wheelZoomSpeed: 0.2 }, false);

    messages.length = 0;
    for (const [deltaY, clientX] of [
      [-120, 100],
      [-120, 300],
      [120, 500],
    ] as const) {
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY,
          clientX,
          clientY: 100,
          bubbles: true,
          cancelable: true,
        }),
      );
    }

    expect(messages).toEqual([]);
    expect(frames.pending()).toBe(1);
    frames.flush();

    expect(messages).toEqual([
      { type: "zoom", factor: 0.8, centerX: 0.03125 },
      { type: "zoom", factor: 0.8, centerX: 0.34375 },
      { type: "zoom", factor: 1.2, centerX: 0.65625 },
    ]);
    chart.destroy();
  });
});

describe("BaseChart viewport input ordering", () => {
  function dispatchWheel(canvas: HTMLCanvasElement): void {
    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -120,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  it("flushes pending wheel input before a new pointer gesture", () => {
    const frames = installAnimationFrameHarness();
    const canvas = createCanvas();
    const { worker, messages } = createWorkerStub();
    const chart = new TestChart(canvas, worker, {
      animated: false,
      interactive: true,
      rangeSelector: { visible: false },
    });

    messages.length = 0;
    dispatchWheel(canvas);
    expect(messages).toEqual([]);
    expect(frames.pending()).toBe(1);

    canvas.dispatchEvent(
      new MouseEvent("mousedown", {
        button: 0,
        clientX: 200,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(frames.pending()).toBe(0);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: "viewportInputBatch",
      commands: [{ type: "zoom", factor: 0.9 }],
    });
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    chart.destroy();
  });

  it("flushes pending input before setViewport and reset", () => {
    const frames = installAnimationFrameHarness();
    const canvas = createCanvas();
    const { worker, messages } = createWorkerStub();
    const chart = new TestChart(canvas, worker, {
      animated: false,
      interactive: true,
    });

    messages.length = 0;
    dispatchWheel(canvas);
    chart.setViewport({ xMin: 0.2, xMax: 0.8 }, { animated: false });
    expect(messages.map((message) => message.type)).toEqual([
      "viewportInputBatch",
      "setViewportRange",
    ]);
    expect(frames.pending()).toBe(0);

    messages.length = 0;
    dispatchWheel(canvas);
    chart.reset({ animated: false });
    expect(messages.map((message) => message.type)).toEqual(["viewportInputBatch", "reset"]);
    expect(frames.pending()).toBe(0);
    chart.destroy();
  });

  it("flushes pending input before resize and appearance updates", () => {
    const frames = installAnimationFrameHarness();
    const canvas = createCanvas();
    const { worker, messages } = createWorkerStub();
    const chart = new TestChart(canvas, worker, {
      animated: false,
      interactive: true,
    });

    messages.length = 0;
    dispatchWheel(canvas);
    chart.resize();
    expect(messages.map((message) => message.type)).toEqual(["viewportInputBatch", "resize"]);
    expect(frames.pending()).toBe(0);

    messages.length = 0;
    dispatchWheel(canvas);
    chart.updateAppearance({ grid: { color: "#123456" } });
    expect(messages.map((message) => message.type)).toEqual([
      "viewportInputBatch",
      "updateAppearance",
    ]);
    expect(frames.pending()).toBe(0);

    messages.length = 0;
    dispatchWheel(canvas);
    chart.setLabels({ top: { text: "Updated title" } });
    expect(messages.map((message) => message.type)).toEqual([
      "viewportInputBatch",
      "setLabels",
      "resize",
    ]);
    expect(frames.pending()).toBe(0);
    chart.destroy();
  });

  it("drops a scheduled viewport batch when the chart is destroyed", () => {
    const frames = installAnimationFrameHarness();
    const canvas = createCanvas();
    const { worker, messages } = createWorkerStub();
    const chart = new TestChart(canvas, worker, { interactive: true });

    messages.length = 0;
    dispatchWheel(canvas);
    expect(frames.pending()).toBe(1);
    chart.destroy();

    expect(frames.pending()).toBe(0);
    frames.flush();
    expect(messages.map((message) => message.type)).toEqual(["stop"]);
  });
});

describe("BaseChart zoom speed validation", () => {
  function zoomFactorFor(wheelZoomSpeed: number): number | null {
    const frames = installAnimationFrameHarness();
    const canvas = createCanvas();
    const { worker, messages } = createWorkerStub();
    const chart = new TestChart(canvas, worker, { interactive: true, wheelZoomSpeed });

    messages.length = 0;
    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -120,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
    frames.flush();
    const factor = getLatestZoomFactor(messages);
    chart.destroy();
    return factor;
  }

  it("falls back to the default for NaN speeds", () => {
    expect(zoomFactorFor(Number.NaN)).toBeCloseTo(0.9);
  });

  it("clamps negative speeds to zero", () => {
    expect(zoomFactorFor(-0.5)).toBeCloseTo(1);
  });

  it("clamps speeds >= 1 so the zoom-in factor stays positive", () => {
    const factor = zoomFactorFor(1.5);
    expect(factor).not.toBeNull();
    expect(factor!).toBeGreaterThan(0);
    expect(factor!).toBeLessThan(1);
  });
});
