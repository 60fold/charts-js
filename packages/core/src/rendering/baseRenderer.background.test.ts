import { describe, expect, it, vi } from "vitest";
import {
  WorkerState,
  drawBackground,
  parseOverlayConfig,
  replaceChartBackground,
} from "./baseRenderer";

function createBackgroundContext(): CanvasRenderingContext2D & {
  fillStyleValue: string | CanvasGradient | CanvasPattern;
  fillRects: number;
  stops: Array<{ offset: number; color: string }>;
} {
  const stops: Array<{ offset: number; color: string }> = [];
  const gradient = {
    addColorStop: (offset: number, color: string) => {
      if (!Number.isFinite(offset)) throw new Error("Non-finite gradient stop");
      stops.push({ offset, color });
    },
  } as CanvasGradient;

  const ctx: {
    fillStyleValue: string | CanvasGradient | CanvasPattern;
    fillRects: number;
    stops: Array<{ offset: number; color: string }>;
    createLinearGradient: () => CanvasGradient;
    fillRect: () => void;
  } = {
    fillStyleValue: "",
    fillRects: 0,
    stops,
    createLinearGradient: () => gradient,
    fillRect: () => {
      ctx.fillRects++;
    },
  };

  Object.defineProperty(ctx, "fillStyle", {
    get: () => ctx.fillStyleValue,
    set: (value: string | CanvasGradient | CanvasPattern) => {
      ctx.fillStyleValue = value;
    },
  });

  return ctx as unknown as CanvasRenderingContext2D & {
    fillStyleValue: string | CanvasGradient | CanvasPattern;
    fillRects: number;
    stops: Array<{ offset: number; color: string }>;
  };
}

describe("drawBackground", () => {
  it("draws a single-color gradient as a solid fill", () => {
    const ctx = createBackgroundContext();

    expect(() =>
      drawBackground(
        ctx,
        { type: "gradient", colors: ["#112233"], direction: "vertical" },
        0,
        0,
        10,
        10,
      ),
    ).not.toThrow();

    expect(ctx.fillStyleValue).toBe("#112233");
    expect(ctx.fillRects).toBe(1);
    expect(ctx.stops).toEqual([]);
  });

  it.each([
    ["an unparseable string", ["#112233", "notacolor", "#445566"]],
    ["an empty string", ["#112233", "", "#445566"]],
    ["an unresolved custom property", ["#112233", "var(--brand)", "#445566"]],
    [
      "a hole",
      (() => {
        const colors = ["#112233"];
        colors[2] = "#445566";
        return colors;
      })(),
    ],
  ])("keeps drawing when a gradient stop is %s", (_label, colors) => {
    const ctx = createBackgroundContext();
    // Mirror Canvas2D: addColorStop throws on anything it cannot parse.
    const gradient = ctx.createLinearGradient(0, 0, 0, 10);
    const push = gradient.addColorStop.bind(gradient);
    gradient.addColorStop = (offset: number, color: string) => {
      if (typeof color !== "string" || !/^#|^rgb|^hsl|^transparent$/u.test(color)) {
        throw new Error(`could not be parsed as a color: ${String(color)}`);
      }
      push(offset, color);
    };

    expect(() =>
      drawBackground(ctx, { type: "gradient", colors, direction: "vertical" } as any, 0, 0, 10, 10),
    ).not.toThrow();

    // The bad stop is skipped; the valid ones still define the gradient.
    expect(ctx.stops.map((stop) => stop.color)).toEqual(["#112233", "#445566"]);
    expect(ctx.fillRects).toBe(1);
  });

  it("closes a transferred bitmap when its background is replaced", () => {
    const state = new WorkerState();
    const image = { close: vi.fn() } as unknown as ImageBitmap;

    replaceChartBackground(state, {
      type: "image",
      image,
      __sixtyfoldOwnsImageBitmap: true,
    } as any);
    replaceChartBackground(state, "#112233");

    expect(image.close).toHaveBeenCalledOnce();
  });

  it("keeps a shared transferred bitmap alive until background and overlay release it", () => {
    const state = new WorkerState();
    const image = { close: vi.fn() } as unknown as ImageBitmap;
    const ownedImage = {
      type: "image",
      image,
      __sixtyfoldOwnsImageBitmap: true,
    } as any;

    replaceChartBackground(state, ownedImage);
    parseOverlayConfig(state, {
      items: [
        {
          kind: "image",
          src: image,
          width: 20,
          height: 20,
          __sixtyfoldOwnsImageBitmap: true,
        },
      ],
    });
    replaceChartBackground(state, "#112233");

    expect(image.close).not.toHaveBeenCalled();
    parseOverlayConfig(state, { items: [] });
    expect(image.close).toHaveBeenCalledOnce();
  });

  it("closes an owned bitmap rejected by overlay geometry validation", () => {
    const state = new WorkerState();
    const image = { close: vi.fn() } as unknown as ImageBitmap;

    parseOverlayConfig(state, {
      items: [
        {
          kind: "image",
          src: image,
          width: 0,
          height: 20,
          __sixtyfoldOwnsImageBitmap: true,
        },
      ],
    });

    expect(state.overlayItems).toEqual([]);
    expect(image.close).toHaveBeenCalledOnce();
  });

  it("does not close a rejected overlay bitmap still owned by the background", () => {
    const state = new WorkerState();
    const image = { close: vi.fn() } as unknown as ImageBitmap;

    replaceChartBackground(state, {
      type: "image",
      image,
      __sixtyfoldOwnsImageBitmap: true,
    } as any);
    parseOverlayConfig(state, {
      items: [
        {
          kind: "image",
          src: image,
          width: Number.NaN,
          height: 20,
          __sixtyfoldOwnsImageBitmap: true,
        },
      ],
    });

    expect(image.close).not.toHaveBeenCalled();
    replaceChartBackground(state, "#112233");
    expect(image.close).toHaveBeenCalledOnce();
  });

  it("closes an owned bitmap received in a malformed non-array overlay", () => {
    const state = new WorkerState();
    const image = { close: vi.fn() } as unknown as ImageBitmap;

    parseOverlayConfig(state, {
      items: {
        kind: "image",
        src: image,
        width: 20,
        height: 20,
        __sixtyfoldOwnsImageBitmap: true,
      },
    });

    expect(state.overlayItems).toEqual([]);
    expect(image.close).toHaveBeenCalledOnce();
  });
});
