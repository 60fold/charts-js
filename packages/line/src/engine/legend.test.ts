import { describe, expect, it, vi } from "vitest";
import { WorkerState } from "@sixtyfold/core/internal/renderer";
import { LegendRuntime } from "./legend.js";

function createHarness() {
  const state = new WorkerState();
  state.width = 400;
  state.height = 240;
  state.chartTop = 20;
  state.chartHeight = 180;
  state.chartWidth = 300;
  state.paddingBase = { top: 10, right: 10, bottom: 10, left: 10 };
  state.padding = { ...state.paddingBase };
  const visibility = [true, true];
  const postMessage = vi.fn();
  const setSeriesVisibility = vi.fn((index: number, visible: boolean) => {
    visibility[index] = visible;
    return true;
  });
  const legend = new LegendRuntime(state, {
    getSeriesCount: () => 2,
    getSeriesName: (index) => ["Primary", "Reference"][index],
    getSeriesColor: (index) => ["#f00", "#00f"][index],
    isSeriesVisible: (index) => visibility[index],
    setSeriesVisibility,
    postMessage,
  });
  return { state, legend, visibility, postMessage, setSeriesVisibility };
}

function createContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("line legend runtime", () => {
  it("parses, measures, wraps, and caches a top-row legend", () => {
    const { legend, state } = createHarness();
    const context = createContext();
    legend.parseConfig({
      legend: {
        visible: true,
        position: "top",
        layout: "row",
        align: "center",
        itemGap: 8,
        padding: { top: 4, right: 6, bottom: 4, left: 6 },
        labelFont: { size: 14, width: 50 },
      },
    });

    const measured = legend.getMeasuredItems(context);
    expect(measured.map((item) => item.label)).toEqual(["Primary", "Reference"]);
    expect(legend.getMeasuredItems(context)).toBe(measured);

    const reserve = legend.getCachedReserveSize(measured);
    legend.applyDynamicPadding(reserve);
    const layout = legend.getCachedLayout(measured, reserve);
    expect(layout).toHaveLength(2);
    expect(legend.getCachedLayout(measured, reserve)).toBe(layout);
    expect(state.padding.top).toBeGreaterThan(state.paddingBase.top);
  });

  it("uses hitboxes for interaction and emits layout only when changed", () => {
    const { legend, postMessage, setSeriesVisibility } = createHarness();
    const context = createContext();
    legend.parseConfig({
      legend: {
        visible: true,
        interactive: true,
        position: "top",
        layout: "row",
      },
    });
    const measured = legend.getMeasuredItems(context);
    const reserve = legend.getCachedReserveSize(measured);
    legend.applyDynamicPadding(reserve);
    const layout = legend.getCachedLayout(measured, reserve);
    legend.postLayoutIfChanged();
    legend.postLayoutIfChanged();
    expect(postMessage).toHaveBeenCalledTimes(1);

    const first = layout[0];
    expect(legend.handleClick(first.x + 1, first.y + 1)).toBe(true);
    expect(setSeriesVisibility).toHaveBeenCalledWith(0, false, "legend");
  });

  it("patches only provided fields and resets on a full parse", () => {
    const { legend } = createHarness();
    legend.parseConfig({
      legend: {
        visible: true,
        interactive: true,
        allowHideAll: true,
        position: "bottom",
      },
    });
    legend.patchConfig({ position: "left" });
    expect(legend.visible).toBe(true);
    expect(legend.interactive).toBe(true);
    expect(legend.allowHideAll).toBe(true);
    expect(legend.position).toBe("left");

    legend.parseConfig({});
    expect(legend.visible).toBe(false);
    expect(legend.interactive).toBe(false);
    expect(legend.allowHideAll).toBe(false);
    expect(legend.position).toBe("right");
  });
});
