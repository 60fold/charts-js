import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FakeStockChart,
  lastChart,
  resetFakeCharts,
  type FakeChart,
} from "@test/support/chartDoubles.js";

vi.mock("@sixtyfold/stock", () => ({ StockChart: FakeStockChart }));

const { SixtyfoldStockChart } = await import("../src/stock.jsx");

let container: HTMLDivElement;
let dispose: (() => void) | null = null;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function ohlcv() {
  return {
    timestamp: new Float64Array([0, 1]),
    open: new Float64Array([1, 2]),
    high: new Float64Array([2, 3]),
    low: new Float64Array([0, 1]),
    close: new Float64Array([1.5, 2.5]),
    volume: new Float64Array([10, 20]),
    length: 2,
  };
}

beforeEach(() => {
  resetFakeCharts();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  dispose?.();
  dispose = null;
  container.remove();
});

describe("SixtyfoldStockChart", () => {
  function renderChart(props: Parameters<typeof SixtyfoldStockChart>[0] = {}): FakeChart {
    dispose = render(() => <SixtyfoldStockChart {...props} />, container);
    return lastChart(FakeStockChart);
  }

  it("installs a dataset once when it arrives before the chart is ready", async () => {
    const [data, setData] = createSignal<ReturnType<typeof ohlcv> | undefined>();
    dispose = render(() => <SixtyfoldStockChart data={data()} />, container);
    const chart = lastChart(FakeStockChart);
    const next = ohlcv();

    setData(next);
    expect(chart.callsTo("setData")).toHaveLength(0);
    chart.becomeReady();
    await settle();

    expect(chart.callsTo("setData")).toHaveLength(1);
    expect(chart.callsTo("setData")[0]?.args[0]).toBe(next);
  });

  it("batches data, appearance, and viewport updates", async () => {
    const chart = renderChart({
      data: ohlcv(),
      appearance: { grid: { vertical: false, horizontal: false } },
      viewport: { xMin: 0, xMax: 5 },
    });
    chart.becomeReady();
    await settle();

    const applied = chart.calls.filter((call) =>
      ["setData", "updateAppearance", "setViewport"].includes(call.method),
    );
    expect(applied).toHaveLength(3);
    expect(applied.every((call) => call.inBatch)).toBe(true);
  });

  it("collects stats only when a callback is supplied", () => {
    const onStats = vi.fn();
    const chart = renderChart({ onStats });

    expect(chart.statsCallback).toBeTypeOf("function");
    chart.statsCallback?.({ fps: 60 });
    expect(onStats).toHaveBeenCalledWith({ fps: 60 });
  });

  it("reports an initialization failure exactly once", async () => {
    const onError = vi.fn();
    const chart = renderChart({ onError });
    const failure = new Error("renderer failed");

    chart.failInitialization(failure);
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("reports a renderer failure after initialization", async () => {
    const onError = vi.fn();
    const chart = renderChart({ onError });
    chart.becomeReady();
    await Promise.resolve();
    await Promise.resolve();
    const failure = new Error("renderer stopped");

    chart.failRuntime(failure);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("reports an overlay image failure", () => {
    const onError = vi.fn();
    const chart = renderChart({ onError });
    const failure = new Error("overlay image failed");

    chart.failOverlay(failure);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("gives the canvas an overridable accessible name", () => {
    dispose = render(() => <SixtyfoldStockChart />, container);
    expect(container.querySelector("canvas")?.getAttribute("aria-label")).toBe(
      "Interactive stock chart",
    );
  });

  it("lets canvasProps override the default accessible name", () => {
    dispose = render(
      () => <SixtyfoldStockChart canvasProps={{ "aria-label": "Bitcoin price history" }} />,
      container,
    );
    expect(container.querySelector("canvas")?.getAttribute("aria-label")).toBe(
      "Bitcoin price history",
    );
  });

  it("hands the chart to chartRef and destroys it on cleanup", () => {
    const chartRef = vi.fn();
    const chart = renderChart({ chartRef });

    expect(chartRef).toHaveBeenCalledWith(chart);
    dispose?.();
    dispose = null;

    expect(chartRef).toHaveBeenLastCalledWith(null);
    expect(chart.destroyed).toBe(true);
  });
});
