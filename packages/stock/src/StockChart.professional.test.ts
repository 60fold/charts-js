/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseChart } from "@sixtyfold/core/chart/BaseChart";
import type { ChartWorkerLike } from "@sixtyfold/core/chart/workerInterface";
import {
  STOCK_CROSSHAIR_MOVE_EVENT,
  STOCK_TIME_RANGE_CHANGE_EVENT,
  STOCK_VISIBLE_RANGE_CHANGE_EVENT,
  StockChart,
  type StockChartOptions,
  type StockCrosshairMoveDetail,
  type TimeRangeChangeDetail,
  type StockVisibleRangeChangeDetail,
} from "./StockChart.js";

interface RecordedMessage {
  message: Record<string, any>;
  transfer?: Transferable[];
}

function createChart(options: StockChartOptions = {}, clearInitialMessages = true) {
  const messages: RecordedMessage[] = [];
  const worker: ChartWorkerLike = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(message, transfer) {
      messages.push({ message, transfer });
    },
    terminate: vi.fn(),
  };
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
  if (clearInitialMessages) messages.length = 0;
  return { canvas, chart, messages, worker };
}

function deliver(worker: ChartWorkerLike, data: Record<string, any>): void {
  worker.onmessage?.({ data } as MessageEvent);
}

function dispatchTouch(
  canvas: HTMLCanvasElement,
  type: "touchstart" | "touchend",
  points: Array<{ x: number; y: number }>,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: points.map(({ x, y }) => ({ clientX: x, clientY: y })),
  });
  canvas.dispatchEvent(event);
}

function crosshairParams() {
  return {
    timestamp: 123,
    screenX: 240,
    screenY: 120,
    candle: { open: 10, high: 14, low: 9, close: 13, volume: 500 },
    formatted: {
      open: "$10.00",
      high: "$14.00",
      low: "$9.00",
      close: "$13.00",
      volume: "500",
    },
    change: 3,
    changePercent: 30,
    formattedChange: "$3.00",
    bullish: true,
    color: "#26a69a",
    indicators: [
      {
        id: "sma-20",
        label: "SMA 20",
        value: 12.5,
        formattedValue: "$12.50",
        color: "#f6c85f",
      },
    ],
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("StockChart professional analytics controls", () => {
  it("uses the Sixtyfold namespace for public DOM events", () => {
    expect(STOCK_TIME_RANGE_CHANGE_EVENT).toBe("sixtyfold:time-range-change");
    expect(STOCK_CROSSHAIR_MOVE_EVENT).toBe("sixtyfold:crosshair-move");
    expect(STOCK_VISIBLE_RANGE_CHANGE_EVENT).toBe("sixtyfold:visible-range-change");
  });

  it("normalizes and snapshots initial layer options", () => {
    const indicators = [{ type: "sma" as const, period: 20 }];
    const volumeProfile = {
      rows: 24,
      placement: "right" as const,
      valueAreaPercent: 70,
    };
    const priceLines = [{ id: "target", price: 125, lineDash: [6, 3] }];
    const markers = [
      {
        id: "entry",
        timestamp: 100,
        position: "below" as const,
        shape: "triangle-up" as const,
      },
    ];

    const { chart, messages } = createChart(
      { indicators, volumeProfile, priceLines, markers },
      false,
    );
    const init = messages.find(({ message }) => message.type === "init")!.message;

    indicators[0].period = 99;
    volumeProfile.rows = 2;
    priceLines[0].price = 999;
    priceLines[0].lineDash![0] = 1;
    markers[0].timestamp = 999;

    expect(init.config.indicators).toEqual([{ type: "sma", period: 20 }]);
    expect(init.config.volumeProfile).toEqual({
      rows: 24,
      placement: "right",
      valueAreaPercent: 70,
    });
    expect(init.config.priceLines).toEqual([{ id: "target", price: 125, lineDash: [6, 3] }]);
    expect(init.config.markers).toEqual([
      {
        id: "entry",
        timestamp: 100,
        position: "below",
        shape: "triangle-up",
      },
    ]);
    expect(chart.getOptions()).toMatchObject({
      indicators: [{ type: "sma", period: 20 }],
      volumeProfile: {
        rows: 24,
        placement: "right",
        valueAreaPercent: 70,
      },
      priceLines: [{ id: "target", price: 125, lineDash: [6, 3] }],
      markers: [
        {
          id: "entry",
          timestamp: 100,
          position: "below",
          shape: "triangle-up",
        },
      ],
    });
    chart.destroy();
  });

  it("provides normalized empty defaults", () => {
    const { chart } = createChart();
    expect(chart.getOptions()).toMatchObject({
      indicators: [],
      volumeProfile: false,
      priceLines: [],
      markers: [],
    });
    chart.destroy();
  });

  it("snapshots runtime inputs and participates in chart batches", () => {
    const { chart, messages } = createChart();
    const indicators = [{ type: "ema" as const, period: 12 }];
    const volumeProfile = { rows: 32, placement: "left" as const };
    const priceLines = [{ price: 42, label: "Alert", lineDash: [2, 2] }];
    const markers = [{ timestamp: 7, price: 42, position: "price" as const }];

    chart.batch(() => {
      chart.setIndicators(indicators);
      chart.setVolumeProfile(volumeProfile);
      chart.setPriceLines(priceLines);
      chart.setMarkers(markers);
      expect(messages).toHaveLength(0);
    });

    indicators[0].period = 100;
    volumeProfile.rows = 1;
    priceLines[0].price = -1;
    priceLines[0].lineDash![0] = 99;
    markers[0].timestamp = -1;

    expect(messages.map(({ message }) => message)).toEqual([
      { type: "setIndicators", indicators: [{ type: "ema", period: 12 }] },
      {
        type: "setVolumeProfile",
        volumeProfile: { rows: 32, placement: "left" },
      },
      {
        type: "setPriceLines",
        priceLines: [{ price: 42, label: "Alert", lineDash: [2, 2] }],
      },
      {
        type: "setMarkers",
        markers: [{ timestamp: 7, price: 42, position: "price" }],
      },
    ]);
    expect(chart.getOptions()).toMatchObject({
      indicators: [{ type: "ema", period: 12 }],
      volumeProfile: { rows: 32, placement: "left" },
      priceLines: [{ price: 42, label: "Alert", lineDash: [2, 2] }],
      markers: [{ timestamp: 7, price: 42, position: "price" }],
    });
    chart.destroy();
  });

  it("emits crosshair callbacks and DOM events without a custom tooltip", () => {
    const callback = vi.fn();
    const { canvas, chart, messages, worker } = createChart({
      onCrosshairMove: callback,
    });
    const events: Array<StockCrosshairMoveDetail | null> = [];
    canvas.addEventListener(STOCK_CROSSHAIR_MOVE_EVENT, (event) => {
      events.push((event as CustomEvent<StockCrosshairMoveDetail | null>).detail);
    });

    deliver(worker, {
      type: "tooltipData",
      params: crosshairParams(),
      defaultTitle: "Example",
    });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0]).toMatchObject({
      timestamp: 123,
      candle: { close: 13 },
      indicators: [{ id: "sma-20", value: 12.5 }],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(callback.mock.calls[0][0]);
    expect(messages.some(({ message }) => message.type === "tooltipContent")).toBe(false);

    deliver(worker, { type: "crosshairLeave" });
    expect(callback).toHaveBeenLastCalledWith(null);
    expect(events).toEqual([expect.any(Object), null]);
    chart.destroy();
  });

  it("emits crosshair notifications before custom tooltip rendering", () => {
    const order: string[] = [];
    const { canvas, chart, worker } = createChart({
      onCrosshairMove: () => order.push("callback"),
      tooltip: {
        onRender: (params) => {
          order.push("tooltip");
          return params.defaults;
        },
      },
    });
    canvas.addEventListener(STOCK_CROSSHAIR_MOVE_EVENT, () => {
      order.push("event");
    });

    deliver(worker, {
      type: "tooltipData",
      params: crosshairParams(),
      defaultTitle: "Example",
    });

    expect(order).toEqual(["callback", "event", "tooltip"]);
    chart.destroy();
  });

  it("emits visible-range changes once per distinct synchronized range", () => {
    const callback = vi.fn();
    const { canvas, chart, worker } = createChart({
      onVisibleRangeChange: callback,
    });
    const events: StockVisibleRangeChangeDetail[] = [];
    canvas.addEventListener(STOCK_VISIBLE_RANGE_CHANGE_EVENT, (event) => {
      events.push((event as CustomEvent<StockVisibleRangeChangeDetail>).detail);
    });

    const first = {
      type: "viewportSync",
      viewport: { xMin: 10, xMax: 20 },
      dataBounds: { xMin: 0, xMax: 30 },
    };
    deliver(worker, first);
    deliver(worker, first);
    deliver(worker, {
      ...first,
      viewport: { xMin: 12, xMax: 22 },
    });
    deliver(worker, {
      ...first,
      viewport: { xMin: 12, xMax: 22 },
      dataBounds: { xMin: -10, xMax: 30 },
    });

    expect(callback).toHaveBeenCalledTimes(3);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      viewport: { xMin: 10, xMax: 20 },
      dataBounds: { xMin: 0, xMax: 30 },
    });
    expect(events.at(-1)).toEqual({
      viewport: { xMin: 12, xMax: 22 },
      dataBounds: { xMin: -10, xMax: 30 },
    });
    chart.destroy();
  });

  it("exposes real timestamps for application-owned controls in market time", () => {
    const callback = vi.fn();
    const onTimeRangeChange = vi.fn();
    const rangeEvents: TimeRangeChangeDetail[] = [];
    const { canvas, chart, messages, worker } = createChart({
      timeScale: "market",
      onVisibleRangeChange: callback,
      onTimeRangeChange,
    });
    canvas.addEventListener(STOCK_TIME_RANGE_CHANGE_EVENT, (event) => {
      rangeEvents.push((event as CustomEvent<TimeRangeChangeDetail>).detail);
    });
    chart.setTimeRange("1M");
    onTimeRangeChange.mockClear();
    rangeEvents.length = 0;

    deliver(worker, {
      type: "viewportSync",
      viewport: { xMin: 120, xMax: 240 },
      dataBounds: { xMin: 0, xMax: 360 },
      timeViewport: { xMin: 1_725_000_000, xMax: 1_730_000_000 },
      timeDataBounds: { xMin: 1_704_000_000, xMax: 1_736_000_000 },
    });

    expect(chart.getViewport()).toEqual({
      xMin: 1_725_000_000,
      xMax: 1_730_000_000,
    });
    expect(callback).toHaveBeenCalledWith({
      viewport: { xMin: 1_725_000_000, xMax: 1_730_000_000 },
      dataBounds: { xMin: 1_704_000_000, xMax: 1_736_000_000 },
    });

    chart.setViewport({ xMin: 1_726_000_000, xMax: 1_727_000_000 }, { animated: false });
    expect(messages.at(-1)?.message).toEqual({
      type: "setTimeViewportRange",
      xMin: 1_726_000_000,
      xMax: 1_727_000_000,
    });
    expect(onTimeRangeChange).toHaveBeenCalledWith(null);
    expect(rangeEvents).toEqual([{ range: null, previousRange: "1M", source: "api" }]);
    chart.destroy();
  });

  it.each(["Home", "double-click", "double-tap"] as const)(
    "resets the public market-time viewport after %s",
    (gesture) => {
      const { canvas, chart, messages, worker } = createChart({
        timeScale: "market",
        animated: false,
      });
      const timeDataBounds = { xMin: 1_704_000_000, xMax: 1_736_000_000 };
      deliver(worker, {
        type: "viewportSync",
        viewport: { xMin: 120, xMax: 240 },
        dataBounds: { xMin: 0, xMax: 360 },
        timeViewport: { xMin: 1_725_000_000, xMax: 1_730_000_000 },
        timeDataBounds,
      });
      messages.length = 0;

      if (gesture === "Home") {
        canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      } else if (gesture === "double-click") {
        canvas.dispatchEvent(
          new MouseEvent("dblclick", { clientX: 200, clientY: 100, bubbles: true }),
        );
      } else {
        const now = vi.spyOn(performance, "now");
        now.mockReturnValue(1_000);
        dispatchTouch(canvas, "touchstart", [{ x: 200, y: 100 }]);
        dispatchTouch(canvas, "touchend", []);
        now.mockReturnValue(1_100);
        dispatchTouch(canvas, "touchstart", [{ x: 200, y: 100 }]);
        dispatchTouch(canvas, "touchend", []);
      }

      expect(messages.some(({ message }) => message.type === "reset")).toBe(true);
      expect(chart.getViewport()).toEqual(timeDataBounds);
      chart.destroy();
    },
  );

  it("rejects invalid indicators before poisoning the renderer", () => {
    const { chart, messages } = createChart();

    expect(() => chart.setIndicators([{ type: "sma", period: 0 }])).toThrow(
      "positive integer period",
    );
    expect(() => chart.setIndicators([{ type: "rsi", period: 14 } as never])).toThrow(
      "unsupported type",
    );
    expect(() =>
      chart.setIndicators([
        { id: "trend", type: "sma", period: 20 },
        { id: "trend", type: "ema", period: 50 },
      ]),
    ).toThrow('id "trend" must be unique');
    expect(messages).toHaveLength(0);

    chart.setIndicators([{ type: "ema", period: 20 }]);
    expect(messages).toEqual([
      {
        message: {
          type: "setIndicators",
          indicators: [{ type: "ema", period: 20 }],
        },
        transfer: undefined,
      },
    ]);
    chart.destroy();
  });

  it("rejects duplicate indicator ids during construction", () => {
    expect(() =>
      createChart({
        indicators: [
          { id: "duplicate", type: "sma", period: 3 },
          { id: "duplicate", type: "sma", period: 3 },
        ],
      }),
    ).toThrow('id "duplicate" must be unique');
  });

  it("validates streaming capacity against configured indicator windows", () => {
    const { chart, messages } = createChart({
      indicators: [{ type: "sma", period: 20 }],
    });

    expect(() => chart.initStreaming(0)).toThrow("positive integer");
    expect(() => chart.initStreaming(10)).toThrow("exceeds the streaming capacity");
    expect(messages).toHaveLength(0);

    chart.initStreaming(20);
    expect(messages.map(({ message }) => message.type)).toEqual(["initRingBuffer", "start"]);
    chart.destroy();
  });
});
