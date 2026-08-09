import { act, startTransition, Suspense, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FakeStockChart,
  lastChart,
  resetFakeCharts,
  type FakeChart,
} from "@test/support/chartDoubles.js";

vi.mock("@sixtyfold/stock", () => ({ StockChart: FakeStockChart }));

const { SixtyfoldStockChart } = await import("../src/stock.js");

const ohlcv = () => ({
  timestamp: new Float64Array([0, 1]),
  open: new Float64Array([1, 2]),
  high: new Float64Array([2, 3]),
  low: new Float64Array([0, 1]),
  close: new Float64Array([1.5, 2.5]),
  volume: new Float64Array([10, 20]),
  length: 2,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  resetFakeCharts();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function mount(element: React.ReactElement): Promise<FakeChart> {
  await act(async () => {
    root.render(element);
  });
  return lastChart(FakeStockChart);
}

describe("SixtyfoldStockChart", () => {
  it("installs a dataset exactly once when it arrives before the chart is ready", async () => {
    const chart = await mount(<SixtyfoldStockChart />);
    const data = ohlcv();

    await act(async () => {
      root.render(<SixtyfoldStockChart data={data} />);
    });
    expect(chart.callsTo("setData")).toHaveLength(0);

    await act(async () => chart.becomeReady());

    expect(chart.callsTo("setData")).toHaveLength(1);
    expect(chart.callsTo("setData")[0]?.args[0]).toBe(data);
  });

  it("reports a construction failure through onError instead of throwing", async () => {
    const failure = new Error("canvas already has a context");
    FakeStockChart.constructorError = failure;
    const onError = vi.fn();

    await act(async () => {
      root.render(<SixtyfoldStockChart onError={onError} />);
    });

    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("reports an initialization failure exactly once", async () => {
    const onError = vi.fn();
    const chart = await mount(<SixtyfoldStockChart onError={onError} />);
    const failure = new Error("renderer failed");

    await act(async () => chart.failInitialization(failure));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("reports a renderer failure after initialization", async () => {
    const onError = vi.fn();
    const chart = await mount(<SixtyfoldStockChart onError={onError} />);
    await act(async () => chart.becomeReady());
    const failure = new Error("renderer stopped");

    act(() => chart.failRuntime(failure));

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("reports an overlay image failure", async () => {
    const onError = vi.fn();
    const chart = await mount(<SixtyfoldStockChart onError={onError} />);
    const failure = new Error("overlay image failed");

    act(() => chart.failOverlay(failure));

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("ignores a callback from a render that suspends before commit", async () => {
    const committedOnReady = vi.fn();
    const discardedOnReady = vi.fn();
    const neverResolves = new Promise<void>(() => {});
    let beginDiscardedRender!: () => void;
    let suspended = false;

    function SuspendedSibling(): never {
      suspended = true;
      throw neverResolves;
    }

    function Harness() {
      const [discard, setDiscard] = useState(false);
      beginDiscardedRender = () => setDiscard(true);
      return (
        <Suspense fallback={<span>pending</span>}>
          <SixtyfoldStockChart onReady={discard ? discardedOnReady : committedOnReady} />
          {discard ? <SuspendedSibling /> : null}
        </Suspense>
      );
    }

    const chart = await mount(<Harness />);
    act(() => {
      startTransition(beginDiscardedRender);
    });
    expect(suspended).toBe(true);

    await act(async () => chart.becomeReady());

    expect(discardedOnReady).not.toHaveBeenCalled();
    expect(committedOnReady).toHaveBeenCalledWith(chart);
  });

  it("leaves stats collection off until a listener is supplied", async () => {
    const chart = await mount(<SixtyfoldStockChart />);
    expect(chart.statsCallback).toBeNull();

    await act(async () => {
      root.render(<SixtyfoldStockChart onStats={() => {}} />);
    });
    expect(chart.statsCallback).toBeTypeOf("function");
  });

  it("omits `animated` so the chart's configured default wins", async () => {
    const chart = await mount(<SixtyfoldStockChart viewport={{ xMin: 0, xMax: 10 }} />);
    await act(async () => chart.becomeReady());

    expect(chart.callsTo("setViewport")[0]?.args[1]).toEqual({ animated: undefined });
  });

  it("applies data, appearance, and viewport in a single batch", async () => {
    const chart = await mount(
      <SixtyfoldStockChart
        data={ohlcv()}
        appearance={{ grid: { color: "#123456" } }}
        viewport={{ xMin: 0, xMax: 5 }}
      />,
    );
    await act(async () => chart.becomeReady());

    const applied = chart.calls.filter((call) =>
      ["setData", "updateAppearance", "setViewport"].includes(call.method),
    );
    expect(applied).toHaveLength(3);
    expect(applied.every((call) => call.inBatch)).toBe(true);
  });

  it("gives the canvas an overridable accessible name", async () => {
    await mount(<SixtyfoldStockChart />);
    const canvas = container.querySelector("canvas");
    expect(canvas?.getAttribute("aria-label")).toBe("Interactive stock chart");
    expect(canvas?.getAttribute("role")).toBe("application");
    expect(canvas?.getAttribute("tabindex")).toBe("0");
  });

  it("destroys the chart on unmount", async () => {
    const chart = await mount(<SixtyfoldStockChart />);
    await act(async () => chart.becomeReady());

    await act(async () => root.unmount());
    root = createRoot(container);

    expect(chart.destroyed).toBe(true);
  });
});
