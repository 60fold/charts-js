import { describe, expect, it } from "vitest";
import { drawMarker } from "./baseRenderer";

interface MarkerMockContext {
  _fillStyle: string;
  _strokeStyle: string;
  _lineWidth: number;
  _shadowBlur: number;
  _shadowColor: string;
  _globalAlpha: number;
  shadowColorWrites: string[];
  globalAlphaWrites: number[];
  maxShadowBlur: number;
  arcCalls: number;
  strokeCalls: number;
  save: () => void;
  restore: () => void;
  beginPath: () => void;
  rect: (x: number, y: number, w: number, h: number) => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  closePath: () => void;
  fill: () => void;
  stroke: () => void;
  arc: (x: number, y: number, r: number, s: number, e: number) => void;
}

function createMarkerMockContext(): MarkerMockContext & CanvasRenderingContext2D {
  const stack: Array<{
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    shadowBlur: number;
    shadowColor: string;
    globalAlpha: number;
  }> = [];

  const ctx: MarkerMockContext = {
    _fillStyle: "",
    _strokeStyle: "",
    _lineWidth: 1,
    _shadowBlur: 0,
    _shadowColor: "",
    _globalAlpha: 1,
    shadowColorWrites: [],
    globalAlphaWrites: [],
    maxShadowBlur: 0,
    arcCalls: 0,
    strokeCalls: 0,
    save: () => {
      stack.push({
        fillStyle: ctx._fillStyle,
        strokeStyle: ctx._strokeStyle,
        lineWidth: ctx._lineWidth,
        shadowBlur: ctx._shadowBlur,
        shadowColor: ctx._shadowColor,
        globalAlpha: ctx._globalAlpha,
      });
    },
    restore: () => {
      const snap = stack.pop();
      if (!snap) return;
      ctx._fillStyle = snap.fillStyle;
      ctx._strokeStyle = snap.strokeStyle;
      ctx._lineWidth = snap.lineWidth;
      ctx._shadowBlur = snap.shadowBlur;
      ctx._shadowColor = snap.shadowColor;
      ctx._globalAlpha = snap.globalAlpha;
    },
    beginPath: () => {},
    rect: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {
      ctx.strokeCalls++;
    },
    arc: () => {
      ctx.arcCalls++;
    },
  };

  Object.defineProperty(ctx, "fillStyle", {
    get: () => ctx._fillStyle,
    set: (value: unknown) => {
      ctx._fillStyle = String(value);
    },
  });

  Object.defineProperty(ctx, "strokeStyle", {
    get: () => ctx._strokeStyle,
    set: (value: unknown) => {
      ctx._strokeStyle = String(value);
    },
  });

  Object.defineProperty(ctx, "lineWidth", {
    get: () => ctx._lineWidth,
    set: (value: unknown) => {
      ctx._lineWidth = Number(value);
    },
  });

  Object.defineProperty(ctx, "shadowBlur", {
    get: () => ctx._shadowBlur,
    set: (value: unknown) => {
      ctx._shadowBlur = Number(value);
      if (ctx._shadowBlur > ctx.maxShadowBlur) ctx.maxShadowBlur = ctx._shadowBlur;
    },
  });

  Object.defineProperty(ctx, "shadowColor", {
    get: () => ctx._shadowColor,
    set: (value: unknown) => {
      ctx._shadowColor = String(value);
      ctx.shadowColorWrites.push(ctx._shadowColor);
    },
  });

  Object.defineProperty(ctx, "globalAlpha", {
    get: () => ctx._globalAlpha,
    set: (value: unknown) => {
      ctx._globalAlpha = Number(value);
      ctx.globalAlphaWrites.push(ctx._globalAlpha);
    },
  });

  return ctx as unknown as MarkerMockContext & CanvasRenderingContext2D;
}

describe("drawMarker", () => {
  it("normalizes #RRGGBBAA colors to rgba() before drawing", () => {
    const ctx = createMarkerMockContext();

    drawMarker(ctx, 10, 12, "circle", 6, "#11223344", "#aabbccdd", 2);

    expect(ctx._fillStyle).toBe("rgba(17,34,51,0.26666666666666666)");
    expect(ctx._strokeStyle).toBe("rgba(170,187,204,0.8666666666666667)");
    expect(ctx._lineWidth).toBe(2);
  });

  it("falls back to circle when marker shape is unknown", () => {
    const ctx = createMarkerMockContext();

    drawMarker(ctx, 10, 12, "unknown-shape", 6, "#ff0000", "#000000", 1);

    expect(ctx.arcCalls).toBe(1);
  });

  it("ignores non-positive marker sizes", () => {
    const ctx = createMarkerMockContext();

    drawMarker(ctx, 10, 12, "circle", -1, "#ff0000", "#000000", 1);

    expect(ctx.arcCalls).toBe(0);
    expect(ctx.strokeCalls).toBe(0);
  });

  it("clamps negative marker border width", () => {
    const ctx = createMarkerMockContext();

    drawMarker(ctx, 10, 12, "circle", 6, "#ff0000", "#000000", -1);

    expect(ctx.arcCalls).toBe(1);
    expect(ctx.strokeCalls).toBe(0);
  });

  it("applies glow opacity and restores context state after draw", () => {
    const ctx = createMarkerMockContext();

    drawMarker(ctx, 20, 30, "circle", 6, "#3366ff", "#ffffff", 1, {
      enabled: true,
      blur: 12,
      opacity: 0.4,
    });

    expect(ctx.maxShadowBlur).toBe(12);
    expect(ctx.shadowColorWrites).toContain("#3366ff");
    expect(ctx.globalAlphaWrites).toContain(0.4);
    expect(ctx._shadowBlur).toBe(0);
    expect(ctx._shadowColor).toBe("");
    expect(ctx._globalAlpha).toBe(1);
  });

  it("supports named glow colors while applying opacity", () => {
    const ctx = createMarkerMockContext();

    drawMarker(ctx, 24, 36, "circle", 5, "#3366ff", "#ffffff", 1, {
      enabled: true,
      color: "red",
      blur: 10,
      opacity: 0.25,
    });

    expect(ctx.shadowColorWrites).toContain("red");
    expect(ctx.globalAlphaWrites).toContain(0.25);
  });

  it("renders line marker shape without circle fallback", () => {
    const ctx = createMarkerMockContext();

    drawMarker(ctx, 14, 20, "line", 6, "#58abf0", "#ffffff", 1);

    expect(ctx.arcCalls).toBe(0);
    expect(ctx.strokeCalls).toBeGreaterThan(0);
  });
});
