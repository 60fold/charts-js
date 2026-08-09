/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseChart } from "@sixtyfold/core/chart/BaseChart";
import { StockChart, type StockChartOptions } from "./StockChart";
import type { ChartWorkerLike } from "@sixtyfold/core/chart/workerInterface";
import { markViewportInputBatchRenderer } from "../../core/src/chart/internalRendererCapabilities";

interface RecordedMessage {
  message: Record<string, any>;
  transfer?: Transferable[];
}

function createChart(options: StockChartOptions = {}) {
  const messages: RecordedMessage[] = [];
  const worker: ChartWorkerLike = {
    onmessage: null,
    postMessage(message, transfer) {
      messages.push({ message, transfer });
    },
    terminate: vi.fn(),
  };
  markViewportInputBatchRenderer(worker);
  vi.spyOn(BaseChart as any, "selectChartRenderer").mockReturnValue({
    renderer: () => worker,
    useWorker: true,
    resolvedRenderMode: "worker",
  });

  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 800,
        bottom: 400,
        width: 800,
        height: 400,
        toJSON: () => ({}),
      }) as DOMRect,
  });
  document.body.appendChild(canvas);

  const chart = new StockChart(canvas, options);
  messages.length = 0;
  return { canvas, chart, messages };
}

function installAnimationFrameHarness(): { pending(): number } {
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

function packedColumns(): Float64Array[] {
  const buffer = new ArrayBuffer(6 * 2 * Float64Array.BYTES_PER_ELEMENT);
  return Array.from(
    { length: 6 },
    (_, index) => new Float64Array(buffer, index * 2 * Float64Array.BYTES_PER_ELEMENT, 2),
  );
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("StockChart transfer lists", () => {
  it("flushes pending wheel input before setData", () => {
    const frames = installAnimationFrameHarness();
    const { canvas, chart, messages } = createChart({ interactive: true });

    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -120,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(messages).toEqual([]);
    expect(frames.pending()).toBe(1);

    const [timestamp, open, high, low, close, volume] = packedColumns();
    chart.setData({ timestamp, open, high, low, close, volume, length: 2 });

    expect(messages.map(({ message }) => message.type)).toEqual([
      "viewportInputBatch",
      "setData",
      "start",
    ]);
    expect(frames.pending()).toBe(0);
    chart.destroy();
  });

  it("deduplicates packed OHLCV buffers in setData", () => {
    const { chart, messages } = createChart();
    const [timestamp, open, high, low, close, volume] = packedColumns();

    chart.setData({ timestamp, open, high, low, close, volume, length: 2 });

    const sent = messages.find(({ message }) => message.type === "setData");
    expect(sent?.transfer).toEqual([timestamp.buffer]);
    chart.destroy();
  });

  it("deduplicates packed OHLCV buffers in addCandles", () => {
    const { chart, messages } = createChart();
    const [timestamps, opens, highs, lows, closes, volumes] = packedColumns();

    chart.addCandles(timestamps, opens, highs, lows, closes, volumes);

    const sent = messages.find(({ message }) => message.type === "addCandles");
    expect(sent?.transfer).toEqual([timestamps.buffer]);
    chart.destroy();
  });

  it("sends an initial streaming range with the bulk candle transfer", () => {
    const { chart, messages } = createChart();
    const [timestamps, opens, highs, lows, closes, volumes] = packedColumns();

    chart.addCandles(timestamps, opens, highs, lows, closes, volumes, {
      initialTimeRange: "5D",
    });

    const sent = messages.find(({ message }) => message.type === "addCandles");
    expect(sent?.message.initialTimeRange).toBe("5D");
    expect(sent?.transfer).toEqual([timestamps.buffer]);
    chart.destroy();
  });

  it("transfers multiple initial candle batches in one renderer message", () => {
    const { chart, messages } = createChart();
    const first = packedColumns();
    const second = packedColumns();

    chart.addCandleBatches(
      [
        {
          timestamp: first[0],
          open: first[1],
          high: first[2],
          low: first[3],
          close: first[4],
          volume: first[5],
        },
        {
          timestamp: second[0],
          open: second[1],
          high: second[2],
          low: second[3],
          close: second[4],
          volume: second[5],
        },
      ],
      { initialTimeRange: "5D" },
    );

    const sent = messages.find(({ message }) => message.type === "addCandleBatches");
    expect(sent?.message.batches).toHaveLength(2);
    expect(sent?.message.initialTimeRange).toBe("5D");
    expect(sent?.transfer).toEqual([first[0].buffer, second[0].buffer]);
    chart.destroy();
  });

  it("normalizes descending data before transferring it", () => {
    const { chart, messages } = createChart();
    const timestamp = new Float64Array([3, 2, 1]);
    const open = new Float64Array([30, 20, 10]);
    const high = new Float64Array([31, 21, 11]);
    const low = new Float64Array([29, 19, 9]);
    const close = new Float64Array([30.5, 20.5, 10.5]);
    const volume = new Float64Array([300, 200, 100]);

    chart.setData({ timestamp, open, high, low, close, volume, length: 3 });

    const sent = messages.find(({ message }) => message.type === "setData");
    expect(Array.from(sent!.message.timestamp)).toEqual([1, 2, 3]);
    expect(Array.from(sent!.message.open)).toEqual([10, 20, 30]);
    expect(sent?.transfer).toContain(sent!.message.timestamp.buffer);
    expect(Array.from(timestamp)).toEqual([3, 2, 1]);
    chart.destroy();
  });
});
