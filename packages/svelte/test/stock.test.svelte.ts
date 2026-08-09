import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FakeStockChart,
  lastChart,
  resetFakeCharts,
  type FakeChart,
} from "@test/support/chartDoubles.js";

vi.mock("@sixtyfold/stock", () => ({ StockChart: FakeStockChart }));

const StockChartComponent = (await import("../src/stock.svelte")).default;

let container: HTMLDivElement;
let component: Record<string, unknown> | null = null;
const props: Record<string, unknown> = $state({});

function render(initial: Record<string, unknown> = {}): FakeChart {
  for (const key of Object.keys(props)) delete props[key];
  Object.assign(props, initial);
  component = mount(StockChartComponent, { target: container, props });
  flushSync();
  return lastChart(FakeStockChart);
}

function setProps(next: Record<string, unknown>): void {
  Object.assign(props, next);
  flushSync();
}

function teardown(): void {
  if (component) void unmount(component);
  component = null;
}

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

async function becomeReady(chart: FakeChart): Promise<void> {
  chart.becomeReady();
  await Promise.resolve();
  await Promise.resolve();
  flushSync();
}

beforeEach(() => {
  resetFakeCharts();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  teardown();
  container.remove();
});

describe("stock.svelte", () => {
  it("installs a dataset once when it arrives before the chart is ready", async () => {
    const chart = render();
    const data = ohlcv();

    setProps({ data });
    expect(chart.callsTo("setData")).toHaveLength(0);
    await becomeReady(chart);

    expect(chart.callsTo("setData")).toHaveLength(1);
    expect(chart.callsTo("setData")[0]?.args[0]).toBe(props.data);
  });

  it("batches data, appearance, and viewport updates", async () => {
    const chart = render({
      data: ohlcv(),
      appearance: { grid: { vertical: false, horizontal: false } },
      viewport: { xMin: 0, xMax: 5 },
    });
    await becomeReady(chart);

    const applied = chart.calls.filter((call) =>
      ["setData", "updateAppearance", "setViewport"].includes(call.method),
    );
    expect(applied).toHaveLength(3);
    expect(applied.every((call) => call.inBatch)).toBe(true);
  });

  it("collects stats only when a callback is supplied", () => {
    const onStats = vi.fn();
    const chart = render({ onStats });

    expect(chart.statsCallback).toBeTypeOf("function");
    chart.statsCallback?.({ fps: 60 });
    expect(onStats).toHaveBeenCalledWith({ fps: 60 });
  });

  it("reports an initialization failure exactly once", async () => {
    const onError = vi.fn();
    const chart = render({ onError });
    const failure = new Error("renderer failed");

    chart.failInitialization(failure);
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("reports a renderer failure after initialization", async () => {
    const onError = vi.fn();
    const chart = render({ onError });
    await becomeReady(chart);
    const failure = new Error("renderer stopped");

    chart.failRuntime(failure);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("reports an overlay image failure", () => {
    const onError = vi.fn();
    const chart = render({ onError });
    const failure = new Error("overlay image failed");

    chart.failOverlay(failure);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("destroys the chart on unmount", async () => {
    const chart = render();
    await becomeReady(chart);

    teardown();

    expect(chart.destroyed).toBe(true);
  });
});
