import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FakeLineChart,
  lastChart,
  resetFakeCharts,
  type FakeChart,
} from "@test/support/chartDoubles.js";

vi.mock("@sixtyfold/line", () => ({ LineChart: FakeLineChart }));

const LineChartComponent = (await import("../src/line.svelte")).default;

type Props = Record<string, unknown>;

let container: HTMLDivElement;
let component: Record<string, unknown> | null = null;
// $state may only initialize a declaration, so the proxy is created once and
// reset per test rather than rebuilt inside render().
const props: Props = $state({});

/** Mounts behind the $state proxy so a test can change a prop and have the
 *  same chart instance receive the update. */
function render(initial: Props = {}): FakeChart {
  for (const key of Object.keys(props)) delete props[key];
  Object.assign(props, initial);
  component = mount(LineChartComponent, { target: container, props });
  flushSync();
  return lastChart(FakeLineChart);
}

function setProps(next: Props): void {
  Object.assign(props, next);
  flushSync();
}

/** Resolve initialize() and let the resulting effects run. */
async function becomeReady(chart: FakeChart): Promise<void> {
  chart.becomeReady();
  await Promise.resolve();
  await Promise.resolve();
  flushSync();
}

function teardown(): void {
  if (component) void unmount(component);
  component = null;
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

describe("line.svelte", () => {
  it("installs a dataset exactly once when it arrives before the chart is ready", async () => {
    const chart = render({});
    const data = { x: new Float64Array([0, 1]), y: new Float64Array([2, 3]) };

    setProps({ data });
    expect(chart.callsTo("setData")).toHaveLength(0);

    await becomeReady(chart);

    expect(chart.callsTo("setData")).toHaveLength(1);
    // $state deep-proxies plain objects, so compare against what the component
    // actually received rather than the raw literal.
    expect(chart.callsTo("setData")[0]?.args[0]).toBe(props.data);
  });

  it("does not re-install the same dataset when another prop changes", async () => {
    const data = { x: new Float64Array([0, 1]), y: new Float64Array([2, 3]) };
    const chart = render({ data });
    await becomeReady(chart);

    setProps({ appearance: { grid: { visible: false } } });

    expect(chart.callsTo("setData")).toHaveLength(1);
  });

  it("routes a multi-series dataset to setMultiSeriesData", async () => {
    const chart = render({
      data: {
        x: new Float64Array([0, 1]),
        series: [new Float64Array([2, 3])],
        length: 2,
        seriesCount: 1,
      },
    });
    await becomeReady(chart);

    expect(chart.callsTo("setMultiSeriesData")).toHaveLength(1);
    expect(chart.callsTo("setData")).toHaveLength(0);
  });

  it("leaves stats collection off when no listener is supplied", () => {
    const chart = render({});
    expect(chart.statsCallback).toBeNull();
  });

  it("enables stats collection when a listener is supplied", () => {
    const onStats = vi.fn();
    const chart = render({ onStats });

    expect(chart.statsCallback).toBeTypeOf("function");
    chart.statsCallback?.({ fps: 60 });
    expect(onStats).toHaveBeenCalledWith({ fps: 60 });
  });

  it("omits `animated` so the chart's configured default wins", async () => {
    const chart = render({ viewport: { xMin: 0, xMax: 10 } });
    await becomeReady(chart);

    expect(chart.callsTo("setViewport")[0]?.args[1]).toEqual({ animated: undefined });
  });

  it("forwards an explicit viewportAnimated", async () => {
    const chart = render({ viewport: { xMin: 0, xMax: 10 }, viewportAnimated: true });
    await becomeReady(chart);

    expect(chart.callsTo("setViewport")[0]?.args[1]).toEqual({ animated: true });
  });

  it("applies data, appearance, and viewport in a single batch", async () => {
    const chart = render({
      data: { x: new Float64Array([0]), y: new Float64Array([1]) },
      appearance: { grid: { visible: false } },
      viewport: { xMin: 0, xMax: 5 },
    });
    await becomeReady(chart);

    const applied = chart.calls.filter((call) =>
      ["setData", "updateAppearance", "setViewport"].includes(call.method),
    );
    expect(applied).toHaveLength(3);
    expect(applied.every((call) => call.inBatch)).toBe(true);
  });

  it("batches later updates too, not just the initial install", async () => {
    const chart = render({});
    await becomeReady(chart);

    setProps({
      appearance: { grid: { visible: true } },
      viewport: { xMin: 1, xMax: 2 },
    });

    const applied = chart.calls.filter((call) =>
      ["updateAppearance", "setViewport"].includes(call.method),
    );
    expect(applied).toHaveLength(2);
    expect(applied.every((call) => call.inBatch)).toBe(true);
  });

  it("calls onReady with the chart instance", async () => {
    const onReady = vi.fn();
    const chart = render({ onReady });
    await becomeReady(chart);

    expect(onReady).toHaveBeenCalledWith(chart);
  });

  it("calls onError when initialization fails", async () => {
    const onError = vi.fn();
    const failure = new Error("renderer failed");
    const chart = render({ onError });
    chart.failInitialization(failure);
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(failure);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("calls onError when the renderer fails after initialization", async () => {
    const onError = vi.fn();
    const chart = render({ onError });
    await becomeReady(chart);
    const failure = new Error("renderer stopped");

    chart.failRuntime(failure);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("calls onError when an overlay image fails", () => {
    const onError = vi.fn();
    const chart = render({ onError });
    const failure = new Error("overlay image failed");

    chart.failOverlay(failure);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("stays silent when initialization is aborted by unmounting", async () => {
    const onError = vi.fn();
    render({ onError });

    teardown();
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).not.toHaveBeenCalled();
  });

  it("destroys the chart on unmount", async () => {
    const chart = render({});
    await becomeReady(chart);

    teardown();

    expect(chart.destroyed).toBe(true);
  });

  it("gives the canvas an overridable accessible name", () => {
    render({});
    const canvas = container.querySelector("canvas");
    expect(canvas?.getAttribute("aria-label")).toBe("Interactive chart");
    expect(canvas?.getAttribute("role")).toBe("application");
    expect(canvas?.getAttribute("tabindex")).toBe("0");

    setProps({ ariaLabel: "Revenue over time" });
    expect(container.querySelector("canvas")?.getAttribute("aria-label")).toBe("Revenue over time");
  });

  it("renders a view-only chart as a non-focusable image", () => {
    render({ options: { interactive: false } });
    const canvas = container.querySelector("canvas");
    expect(canvas?.getAttribute("aria-label")).toBe("Chart");
    expect(canvas?.getAttribute("role")).toBe("img");
    expect(canvas?.hasAttribute("tabindex")).toBe(false);
  });
});
