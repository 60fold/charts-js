import { act, startTransition, Suspense, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FakeLineChart,
  lastChart,
  resetFakeCharts,
  type FakeChart,
} from "@test/support/chartDoubles.js";

vi.mock("@sixtyfold/line", () => ({ LineChart: FakeLineChart }));

const { SixtyfoldLineChart } = await import("../src/line.js");

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

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

/** Mount and let the deferred construction microtask run. */
async function mount(element: React.ReactElement): Promise<FakeChart> {
  await act(async () => {
    root.render(element);
  });
  return lastChart(FakeLineChart);
}

async function rerender(element: React.ReactElement): Promise<void> {
  await act(async () => {
    root.render(element);
  });
}

describe("SixtyfoldLineChart", () => {
  it("installs a dataset exactly once when it arrives before the chart is ready", async () => {
    // Worker mode transfers the buffers, and every renderer should install a
    // dataset only once for a stable object identity.
    const chart = await mount(<SixtyfoldLineChart />);
    const data = { x: new Float64Array([0, 1]), y: new Float64Array([2, 3]), length: 2 };

    await rerender(<SixtyfoldLineChart data={data} />);
    expect(chart.callsTo("setData")).toHaveLength(0);

    await act(async () => chart.becomeReady());

    expect(chart.callsTo("setData")).toHaveLength(1);
    expect(chart.callsTo("setData")[0]?.args[0]).toBe(data);
  });

  it("does not re-install the same dataset on an unrelated re-render", async () => {
    const data = { x: new Float64Array([0, 1]), y: new Float64Array([2, 3]), length: 2 };
    const chart = await mount(<SixtyfoldLineChart data={data} />);
    await act(async () => chart.becomeReady());

    await rerender(<SixtyfoldLineChart data={data} className="changed" />);

    expect(chart.callsTo("setData")).toHaveLength(1);
  });

  it("routes a chart dataset with a series array to setMultiSeriesData", async () => {
    const data = {
      x: new Float64Array([0, 1]),
      series: [new Float64Array([2, 3])],
      length: 2,
      seriesCount: 1,
    };
    const chart = await mount(<SixtyfoldLineChart data={data} />);
    await act(async () => chart.becomeReady());

    expect(chart.callsTo("setMultiSeriesData")).toHaveLength(1);
    expect(chart.callsTo("setData")).toHaveLength(0);
  });

  it("reports a construction failure through onError instead of throwing", async () => {
    // Construction is deferred into a microtask, so an uncaught throw would be
    // invisible to every error boundary.
    const failure = new Error("canvas already has a context");
    FakeLineChart.constructorError = failure;
    const onError = vi.fn();

    await act(async () => {
      root.render(<SixtyfoldLineChart onError={onError} />);
    });

    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("reports an initialization failure through onError", async () => {
    const onError = vi.fn();
    const onReady = vi.fn();
    const chart = await mount(<SixtyfoldLineChart onError={onError} onReady={onReady} />);
    const failure = new Error("renderer failed");

    await act(async () => chart.failInitialization(failure));

    expect(onError).toHaveBeenCalledWith(failure);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();
  });

  it("reports a post-initialization renderer failure through onError", async () => {
    const onError = vi.fn();
    const chart = await mount(<SixtyfoldLineChart onError={onError} />);
    await act(async () => chart.becomeReady());
    const failure = new Error("renderer stopped");

    act(() => chart.failRuntime(failure));

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("reports an overlay image failure through onError", async () => {
    const onError = vi.fn();
    const chart = await mount(<SixtyfoldLineChart onError={onError} />);
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
          <SixtyfoldLineChart onReady={discard ? discardedOnReady : committedOnReady} />
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

  it("stays silent when initialization is aborted by unmounting", async () => {
    const onError = vi.fn();
    await mount(<SixtyfoldLineChart onError={onError} />);

    await act(async () => root.unmount());
    root = createRoot(container);

    expect(onError).not.toHaveBeenCalled();
  });

  it("leaves stats collection off until a listener is supplied", async () => {
    const chart = await mount(<SixtyfoldLineChart />);
    expect(chart.statsCallback).toBeNull();

    await rerender(<SixtyfoldLineChart onStats={() => {}} />);
    expect(chart.statsCallback).toBeTypeOf("function");

    await rerender(<SixtyfoldLineChart />);
    expect(chart.statsCallback).toBeNull();
  });

  it("omits `animated` so the chart's configured default wins", async () => {
    const viewport = { xMin: 0, xMax: 10 };
    const chart = await mount(<SixtyfoldLineChart viewport={viewport} />);
    await act(async () => chart.becomeReady());

    expect(chart.callsTo("setViewport")[0]?.args[1]).toEqual({ animated: undefined });
  });

  it("forwards an explicit viewportAnimated", async () => {
    const viewport = { xMin: 0, xMax: 10 };
    const chart = await mount(<SixtyfoldLineChart viewport={viewport} viewportAnimated />);
    await act(async () => chart.becomeReady());

    expect(chart.callsTo("setViewport")[0]?.args[1]).toEqual({ animated: true });
  });

  it("ignores a viewport patch with neither bound set", async () => {
    const chart = await mount(<SixtyfoldLineChart viewport={{}} />);
    await act(async () => chart.becomeReady());

    expect(chart.callsTo("setViewport")).toHaveLength(0);
  });

  it("applies data, appearance, and viewport in a single batch", async () => {
    const chart = await mount(
      <SixtyfoldLineChart
        data={{ x: new Float64Array([0]), y: new Float64Array([1]), length: 1 }}
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

  it("batches later updates too, not just the initial install", async () => {
    const chart = await mount(<SixtyfoldLineChart />);
    await act(async () => chart.becomeReady());

    await rerender(
      <SixtyfoldLineChart
        appearance={{ grid: { color: "#654321" } }}
        viewport={{ xMin: 1, xMax: 2 }}
      />,
    );

    const applied = chart.calls.filter((call) =>
      ["updateAppearance", "setViewport"].includes(call.method),
    );
    expect(applied).toHaveLength(2);
    expect(applied.every((call) => call.inBatch)).toBe(true);
  });

  it("destroys the chart on unmount", async () => {
    const chart = await mount(<SixtyfoldLineChart />);
    await act(async () => chart.becomeReady());

    await act(async () => root.unmount());
    root = createRoot(container);

    expect(chart.destroyed).toBe(true);
  });

  it("gives the canvas an overridable accessible name", async () => {
    await mount(<SixtyfoldLineChart />);
    const canvas = container.querySelector("canvas");
    expect(canvas?.getAttribute("aria-label")).toBe("Interactive chart");
    expect(canvas?.getAttribute("role")).toBe("application");
    expect(canvas?.getAttribute("tabindex")).toBe("0");

    await rerender(<SixtyfoldLineChart aria-label="Revenue over time" />);
    expect(container.querySelector("canvas")?.getAttribute("aria-label")).toBe("Revenue over time");
  });

  it("renders a view-only chart as a non-focusable image", async () => {
    await mount(<SixtyfoldLineChart options={{ interactive: false }} />);
    const canvas = container.querySelector("canvas");
    expect(canvas?.getAttribute("aria-label")).toBe("Chart");
    expect(canvas?.getAttribute("role")).toBe("img");
    expect(canvas?.hasAttribute("tabindex")).toBe(false);
  });
});
