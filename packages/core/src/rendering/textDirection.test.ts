import { describe, expect, it, vi } from "vitest";
import {
  WorkerState,
  drawLabels,
  drawCustomLabels,
  parseLabelsConfig,
  parseOverlayConfig,
  measureLabelSpace,
} from "./baseRenderer";

interface TextCall {
  text: string;
  x: number;
  y: number;
  textAlign?: CanvasTextAlign;
  direction?: CanvasDirection;
}

function createTextContext(): CanvasRenderingContext2D & { textCalls: TextCall[] } {
  const target: Record<string, unknown> & { textCalls: TextCall[] } = {
    textCalls: [],
    textAlign: "left",
    direction: "inherit",
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    fillText: (text: string, x: number, y: number) => {
      target.textCalls.push({
        text,
        x,
        y,
        textAlign: target.textAlign as CanvasTextAlign,
        direction: target.direction as CanvasDirection,
      });
    },
  };

  return new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop];
      return () => {};
    },
    set(obj, prop: string, value: unknown) {
      obj[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D & { textCalls: TextCall[] };
}

function createState(): WorkerState {
  const state = new WorkerState();
  state.width = 400;
  state.height = 260;
  state.chartTop = 40;
  state.chartWidth = 300;
  state.chartHeight = 160;
  state.padding = { top: 40, right: 50, bottom: 40, left: 50 };
  state.paddingBase = { ...state.padding };
  return state;
}

describe("Canvas text direction", () => {
  it("uses logical start alignment for RTL chart labels", () => {
    const ctx = createTextContext();
    const state = createState();
    state.textDirection = "rtl";

    parseLabelsConfig(state, {
      top: {
        text: "العنوان",
        align: "start",
      },
    });
    measureLabelSpace(state);
    state.updateDimensions();
    drawLabels(ctx, state);

    const call = ctx.textCalls.find((item) => item.text === "العنوان");
    expect(call).toBeDefined();
    expect(call?.direction).toBe("rtl");
    expect(call?.textAlign).toBe("right");
    expect(call?.x).toBeCloseTo(state.width - state.padding.right, 5);
  });

  it("auto-detects RTL direction for custom and overlay text", () => {
    const ctx = createTextContext();
    const state = createState();
    state.textDirection = "auto";

    parseLabelsConfig(state, {
      custom: [{ text: "תווית", x: 0.5, y: 0.5, align: "start" }],
    });
    parseOverlayConfig(state, {
      items: [{ kind: "text", text: "وسم", x: 0.25, y: 0.25, align: "start" }],
    });

    drawCustomLabels(ctx, state);

    const custom = ctx.textCalls.find((item) => item.text === "תווית");
    const overlay = ctx.textCalls.find((item) => item.text === "وسم");
    expect(custom?.direction).toBe("rtl");
    expect(custom?.textAlign).toBe("right");
    expect(overlay?.direction).toBe("rtl");
    expect(overlay?.textAlign).toBe("right");
  });

  it("closes renderer-owned overlay bitmaps when the overlay is replaced", () => {
    const state = createState();
    const ownedBitmap = { close: vi.fn() };

    parseOverlayConfig(state, {
      items: [
        {
          kind: "image",
          src: ownedBitmap,
          width: 20,
          height: 20,
          __sixtyfoldOwnsImageBitmap: true,
        },
      ],
    });
    parseOverlayConfig(state, { items: [] });

    expect(ownedBitmap.close).toHaveBeenCalledOnce();
  });
});
