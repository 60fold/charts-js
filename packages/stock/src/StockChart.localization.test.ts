/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import {
  STOCK_TIME_RANGE_CHANGE_EVENT,
  StockChart,
  type StockTooltipFieldLabels,
  type TimeRangeChangeDetail,
} from "./StockChart";

function createCanvasHost(): { host: HTMLDivElement; canvas: HTMLCanvasElement } {
  const host = document.createElement("div");
  const chartContainer = document.createElement("div");
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
  chartContainer.appendChild(canvas);
  host.appendChild(chartContainer);
  document.body.appendChild(host);
  return { host, canvas };
}

describe("StockChart localization", () => {
  it("leaves all time-range controls to the host application", () => {
    const { host, canvas } = createCanvasHost();
    const chart = new StockChart(canvas, { renderMode: "main" });

    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(canvas.previousElementSibling).toBeNull();

    chart.destroy();
    host.remove();
  });

  it("uses provided stock tooltip field labels in callback defaults", () => {
    const { host, canvas } = createCanvasHost();
    const fieldLabels: StockTooltipFieldLabels = {
      open: "פתיחה",
      high: "גבוה",
      low: "נמוך",
      close: "סגירה",
      change: "שינוי",
      changePercent: "שינוי %",
      volume: "נפח",
    };
    let labels: string[] = [];
    const onRender = vi.fn((params) => {
      labels = params.defaults.rows.map((row: { label: string }) => row.label);
      return { visible: false };
    });
    const chart = new StockChart(canvas, {
      renderMode: "main",
      tooltip: {
        fieldLabels,
        onRender,
      },
    });

    (chart as any).handleWorkerMessage({
      data: {
        type: "tooltipData",
        params: {
          timestamp: 1_700_000_000,
          screenX: 100,
          screenY: 80,
          candle: {
            open: 10,
            high: 12,
            low: 9,
            close: 11,
            volume: 1000,
          },
          formatted: {
            open: "10",
            high: "12",
            low: "9",
            close: "11",
            volume: "1000",
          },
          change: 1,
          changePercent: 10,
          formattedChange: "1",
          bullish: true,
          color: "#00ff00",
        },
        defaultTitle: "2023",
      },
    });

    expect(onRender).toHaveBeenCalledTimes(1);
    expect(labels).toEqual(["פתיחה", "גבוה", "נמוך", "סגירה", "שינוי", "שינוי %", "נפח"]);

    chart.destroy();
    host.remove();
  });

  it("updates the stock tooltip callback and field filter at runtime", () => {
    const { host, canvas } = createCanvasHost();
    let labels: string[] = [];
    const onRender = vi.fn((params) => {
      labels = params.defaults.rows.map((row: { label: string }) => row.label);
      return { visible: false as const };
    });
    const chart = new StockChart(canvas, { renderMode: "main" });

    chart.updateAppearance({
      tooltip: {
        onRender,
        fields: ["close"],
        fieldLabels: { close: "Closing" },
      },
    });
    (chart as any).handleWorkerMessage({
      data: {
        type: "tooltipData",
        params: {
          timestamp: 1_700_000_000,
          screenX: 100,
          screenY: 80,
          formatted: {
            open: "10",
            high: "12",
            low: "9",
            close: "11",
            volume: "1000",
          },
          change: 1,
          changePercent: 10,
          formattedChange: "1",
          color: "#00ff00",
        },
        defaultTitle: "2023",
      },
    });

    expect(onRender).toHaveBeenCalledTimes(1);
    expect(labels).toEqual(["Closing"]);
    chart.destroy();
    host.remove();
  });
});

describe("StockChart time range state", () => {
  it("reconciles preset events when reset is called directly", () => {
    const { host, canvas } = createCanvasHost();
    const onTimeRangeChange = vi.fn();
    const events: TimeRangeChangeDetail[] = [];
    canvas.addEventListener(STOCK_TIME_RANGE_CHANGE_EVENT, (event) => {
      events.push((event as CustomEvent<TimeRangeChangeDetail>).detail);
    });
    const chart = new StockChart(canvas, {
      renderMode: "main",
      onTimeRangeChange,
    });
    chart.setTimeRange("1M");
    events.length = 0;
    onTimeRangeChange.mockClear();

    chart.reset({ animated: false });

    expect(onTimeRangeChange).toHaveBeenCalledOnce();
    expect(onTimeRangeChange).toHaveBeenCalledWith("ALL");
    expect(events).toEqual([{ range: "ALL", previousRange: "1M", source: "reset" }]);
    chart.destroy();
    host.remove();
  });

  it("reconciles the full-range state when setData replaces data", () => {
    const { host, canvas } = createCanvasHost();
    const events: TimeRangeChangeDetail[] = [];
    canvas.addEventListener(STOCK_TIME_RANGE_CHANGE_EVENT, (event) => {
      events.push((event as CustomEvent<TimeRangeChangeDetail>).detail);
    });
    const chart = new StockChart(canvas, { renderMode: "main" });
    chart.setTimeRange("5D");
    events.length = 0;
    const empty = () => new Float64Array(0);

    chart.setData({
      timestamp: empty(),
      open: empty(),
      high: empty(),
      low: empty(),
      close: empty(),
      volume: empty(),
      length: 0,
    });

    expect(events).toEqual([{ range: "ALL", previousRange: "5D", source: "data" }]);
    chart.destroy();
    host.remove();
  });

  it("reconciles the full-range state when streaming is initialized", () => {
    const { host, canvas } = createCanvasHost();
    const events: TimeRangeChangeDetail[] = [];
    canvas.addEventListener(STOCK_TIME_RANGE_CHANGE_EVENT, (event) => {
      events.push((event as CustomEvent<TimeRangeChangeDetail>).detail);
    });
    const chart = new StockChart(canvas, { renderMode: "main" });
    chart.setTimeRange("1M");
    events.length = 0;

    chart.initStreaming(4);

    expect(events).toEqual([{ range: "ALL", previousRange: "1M", source: "data" }]);
    events.length = 0;
    chart.setTimeRange("1M");
    expect(events).toEqual([{ range: "1M", previousRange: "ALL", source: "api" }]);

    chart.destroy();
    host.remove();
  });

  it("emits one reset event for keyboard and double-click resets", () => {
    const { host, canvas } = createCanvasHost();
    const events: TimeRangeChangeDetail[] = [];
    canvas.addEventListener(STOCK_TIME_RANGE_CHANGE_EVENT, (event) => {
      events.push((event as CustomEvent<TimeRangeChangeDetail>).detail);
    });
    const chart = new StockChart(canvas, { renderMode: "main", animated: false });

    chart.setTimeRange("1M");
    events.length = 0;
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(events).toEqual([{ range: "ALL", previousRange: "1M", source: "reset" }]);

    chart.setTimeRange("1M");
    events.length = 0;
    canvas.dispatchEvent(
      new MouseEvent("dblclick", {
        clientX: 200,
        clientY: 100,
        bubbles: true,
      }),
    );
    expect(events).toEqual([{ range: "ALL", previousRange: "1M", source: "reset" }]);

    chart.destroy();
    host.remove();
  });
});
