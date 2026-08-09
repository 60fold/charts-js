import { describe, expect, it } from "vitest";
import {
  WorkerState,
  calculateTooltipPosition,
  renderTooltipBox,
  resetTooltipRatchet,
  drawSelectionRect,
  COLORS,
  type TooltipContent,
} from "./baseRenderer";

interface TextCall {
  text: string;
  x: number;
  y: number;
  maxWidth?: number;
  textAlign?: CanvasTextAlign;
  direction?: CanvasDirection;
  fillStyle?: string;
}

interface RectCall {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DrawImageCall {
  args: unknown[];
}

function createTooltipContext(widths: Record<string, number>): {
  ctx: CanvasRenderingContext2D;
  textCalls: TextCall[];
  rectCalls: RectCall[];
  drawImageCalls: DrawImageCall[];
  filterWrites: string[];
  strokeCalls: number[];
  shadowColorWrites: string[];
  shadowBlurWrites: number[];
  shadowOffsetXWrites: number[];
  shadowOffsetYWrites: number[];
} {
  const textCalls: TextCall[] = [];
  const rectCalls: RectCall[] = [];
  const drawImageCalls: DrawImageCall[] = [];
  const filterWrites: string[] = [];
  const strokeCalls: number[] = [];
  const shadowColorWrites: string[] = [];
  const shadowBlurWrites: number[] = [];
  const shadowOffsetXWrites: number[] = [];
  const shadowOffsetYWrites: number[] = [];
  let filterValue = "none";
  let shadowColorValue = "";
  let shadowBlurValue = 0;
  let shadowOffsetXValue = 0;
  let shadowOffsetYValue = 0;

  const raw = {
    globalAlpha: 1,
    fillStyle: "",
    textAlign: "left" as CanvasTextAlign,
    direction: "inherit" as CanvasDirection,
    beginPath: () => {},
    rect: () => {},
    moveTo: () => {},
    arcTo: () => {},
    closePath: () => {},
    clip: () => {},
    save: () => {},
    restore: () => {},
    fill: () => {},
    stroke: () => {
      strokeCalls.push(1);
    },
    setLineDash: () => {},
    drawImage: (...args: unknown[]) => {
      drawImageCalls.push({ args });
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      rectCalls.push({ x, y, w, h });
    },
    fillText: (text: string, x: number, y: number, maxWidth?: number) => {
      textCalls.push({
        text: String(text),
        x: Number(x),
        y: Number(y),
        maxWidth: typeof maxWidth === "number" ? maxWidth : undefined,
        textAlign: raw.textAlign,
        direction: raw.direction,
        fillStyle: String(raw.fillStyle),
      });
    },
    measureText: (text: string) =>
      ({ width: widths[String(text)] ?? String(text).length * 8 }) as TextMetrics,
  } as unknown as CanvasRenderingContext2D;

  Object.defineProperty(raw, "filter", {
    get: () => filterValue,
    set: (value: unknown) => {
      filterValue = String(value);
      filterWrites.push(filterValue);
    },
  });

  Object.defineProperty(raw, "shadowColor", {
    get: () => shadowColorValue,
    set: (value: unknown) => {
      shadowColorValue = String(value);
      shadowColorWrites.push(shadowColorValue);
    },
  });

  Object.defineProperty(raw, "shadowBlur", {
    get: () => shadowBlurValue,
    set: (value: unknown) => {
      shadowBlurValue = Number(value);
      shadowBlurWrites.push(shadowBlurValue);
    },
  });

  Object.defineProperty(raw, "shadowOffsetX", {
    get: () => shadowOffsetXValue,
    set: (value: unknown) => {
      shadowOffsetXValue = Number(value);
      shadowOffsetXWrites.push(shadowOffsetXValue);
    },
  });

  Object.defineProperty(raw, "shadowOffsetY", {
    get: () => shadowOffsetYValue,
    set: (value: unknown) => {
      shadowOffsetYValue = Number(value);
      shadowOffsetYWrites.push(shadowOffsetYValue);
    },
  });

  return {
    ctx: raw,
    textCalls,
    rectCalls,
    drawImageCalls,
    filterWrites,
    strokeCalls,
    shadowColorWrites,
    shadowBlurWrites,
    shadowOffsetXWrites,
    shadowOffsetYWrites,
  };
}

describe("renderTooltipBox padding layout", () => {
  it("uses each row color for values when no value-font color overrides it", () => {
    const { ctx, textCalls } = createTooltipContext({
      Title: 40,
      First: 30,
      Second: 40,
      "11": 16,
      "22": 16,
    });

    const state = new WorkerState();
    state.width = 400;
    state.padding.left = 30;
    state.padding.right = 20;
    state.chartTop = 20;
    state.chartHeight = 180;
    state.tooltipPosition = "top-left";

    renderTooltipBox(
      ctx,
      state,
      {
        visible: true,
        title: "Title",
        rows: [
          { label: "First", value: "11", color: "#ffb000", dimmed: false },
          { label: "Second", value: "22", color: "#51d6ff", dimmed: false },
        ],
      },
      100,
    );

    expect(textCalls.find((call) => call.text === "11")?.fillStyle).toBe("#ffb000");
    expect(textCalls.find((call) => call.text === "22")?.fillStyle).toBe("#51d6ff");
  });

  it("applies asymmetric padding to title, row, and swatch positions", () => {
    const { ctx, textCalls, rectCalls } = createTooltipContext({
      Title: 50,
      Label: 30,
      Value: 20,
    });

    const state = new WorkerState();
    state.width = 400;
    state.padding.left = 30;
    state.padding.right = 20;
    state.chartTop = 20;
    state.chartHeight = 200;
    state.tooltipPosition = "top-left";
    state.tooltipBorderRadius = 6;
    state.tooltipPaddingTop = 12;
    state.tooltipPaddingRight = 16;
    state.tooltipPaddingBottom = 4;
    state.tooltipPaddingLeft = 10;
    state.tooltipShowSwatch = true;

    const content: TooltipContent = {
      visible: true,
      title: "Title",
      rows: [{ label: "Label", value: "Value", color: "#ff0000", dimmed: false }],
    };

    renderTooltipBox(ctx, state, content, 100);

    const title = textCalls.find((call) => call.text === "Title");
    const label = textCalls.find((call) => call.text === "Label");
    const value = textCalls.find((call) => call.text === "Value");

    expect(title).toBeTruthy();
    expect(label).toBeTruthy();
    expect(value).toBeTruthy();
    expect(rectCalls).toHaveLength(1);

    // boxX = left padding + margin = 30 + 10 = 40
    // boxY = chartTop + margin = 20 + 10 = 30
    // titleX = boxX + padLeft = 50
    // titleY = boxY + padTop + titleFontSize = 30 + 12 + 12 = 54
    expect(title!.x).toBeCloseTo(50, 5);
    expect(title!.y).toBeCloseTo(54, 5);

    // innerWidth = max(title=50, row=76) = 76
    // rowY = (boxY + padTop + titleHeight) + labelFontSize = (30 + 12 + 16) + 12 = 70
    // labelX = boxX + padLeft + swatch(8) + gap(6) = 64
    // valueX = boxX + padLeft + innerWidth = 126
    expect(label!.x).toBeCloseTo(64, 5);
    expect(label!.y).toBeCloseTo(70, 5);
    expect(value!.x).toBeCloseTo(126, 5);
    expect(value!.y).toBeCloseTo(70, 5);

    // swatchX = boxX + padLeft = 50, swatchY = rowY - 8 = 62
    expect(rectCalls[0]).toEqual({ x: 50, y: 62, w: 8, h: 8 });
  });

  it("mirrors title and row columns for right-to-left tooltips", () => {
    const { ctx, textCalls, rectCalls } = createTooltipContext({
      العنوان: 48,
      السعر: 36,
      "123": 24,
    });

    const state = new WorkerState();
    state.width = 360;
    state.padding.left = 0;
    state.padding.right = 0;
    state.chartTop = 20;
    state.chartHeight = 200;
    state.tooltipPosition = "top-left";
    state.tooltipDirection = "rtl";
    state.tooltipPaddingLeft = 10;
    state.tooltipPaddingRight = 14;
    state.tooltipShowSwatch = true;

    renderTooltipBox(
      ctx,
      state,
      {
        visible: true,
        title: "العنوان",
        rows: [{ label: "السعر", value: "123", color: "#ff0000", dimmed: false }],
      },
      100,
    );

    const title = textCalls.find((call) => call.text === "العنوان");
    const label = textCalls.find((call) => call.text === "السعر");
    const value = textCalls.find((call) => call.text === "123");

    expect(title?.direction).toBe("rtl");
    expect(title?.textAlign).toBe("right");
    expect(label?.textAlign).toBe("right");
    expect(value?.textAlign).toBe("left");
    expect(value!.x).toBeLessThan(label!.x);
    expect(rectCalls[0].x).toBeGreaterThan(label!.x);
  });

  it("renders a backdrop layer when tooltip blur is enabled", () => {
    const { ctx, drawImageCalls, filterWrites } = createTooltipContext({
      Title: 40,
      L: 10,
      V: 10,
    });

    const scratchDraws: Array<unknown[]> = [];
    const state = new WorkerState();
    state.width = 400;
    state.height = 240;
    state.dpr = 1;
    state.padding.left = 30;
    state.padding.right = 20;
    state.chartTop = 20;
    state.chartHeight = 180;
    state.tooltipPosition = "top-left";
    state.tooltipBackdropBlur = 8;
    state.tooltipShowSwatch = false;
    state.canvasFilterSupported = true;
    state.canvas = {
      width: 400,
      height: 240,
      getContext: () => ctx,
    };
    state.createCanvas = (width, height) => ({
      width,
      height,
      getContext: () =>
        ({
          setTransform: () => {},
          clearRect: () => {},
          drawImage: (...args: unknown[]) => {
            scratchDraws.push(args);
          },
        }) as unknown as CanvasRenderingContext2D,
    });

    const content: TooltipContent = {
      visible: true,
      title: "Title",
      rows: [{ label: "L", value: "V", color: "#fff", dimmed: false }],
    };

    renderTooltipBox(ctx, state, content, 120);

    expect(scratchDraws.length).toBe(1);
    expect(drawImageCalls.length).toBe(1);
    expect(filterWrites).toContain("blur(8px) saturate(112%)");
    expect(filterWrites[filterWrites.length - 1]).toBe("none");
  });

  it("skips backdrop blur when canvas filter is unsupported", () => {
    const { ctx, drawImageCalls, filterWrites } = createTooltipContext({
      Title: 40,
      L: 10,
      V: 10,
    });

    const state = new WorkerState();
    state.width = 400;
    state.height = 240;
    state.dpr = 1;
    state.padding.left = 30;
    state.padding.right = 20;
    state.chartTop = 20;
    state.chartHeight = 180;
    state.tooltipPosition = "top-left";
    state.tooltipBackdropBlur = 8;
    state.tooltipShowSwatch = false;
    state.canvasFilterSupported = false;
    state.canvas = {
      width: 400,
      height: 240,
      getContext: () => ctx,
    };

    const content: TooltipContent = {
      visible: true,
      title: "Title",
      rows: [{ label: "L", value: "V", color: "#fff", dimmed: false }],
    };

    renderTooltipBox(ctx, state, content, 120);

    // No blur operations should occur
    expect(filterWrites).not.toContain("blur(8px) saturate(112%)");
    expect(drawImageCalls.length).toBe(0);
  });

  it("detects missing filter support and skips blur", () => {
    const { ctx, drawImageCalls, filterWrites } = createTooltipContext({
      Title: 40,
      L: 10,
      V: 10,
    });

    const state = new WorkerState();
    state.width = 400;
    state.height = 240;
    state.dpr = 1;
    state.padding.left = 30;
    state.padding.right = 20;
    state.chartTop = 20;
    state.chartHeight = 180;
    state.tooltipPosition = "top-left";
    state.tooltipBackdropBlur = 8;
    state.tooltipShowSwatch = false;
    // Leave canvasFilterSupported = null so detection runs
    state.canvas = {
      width: 400,
      height: 240,
      getContext: () => ctx,
    };
    // createCanvas returns a context without a filter property
    state.createCanvas = (width, height) => ({
      width,
      height,
      getContext: () =>
        ({
          setTransform: () => {},
          clearRect: () => {},
          drawImage: () => {},
        }) as unknown as CanvasRenderingContext2D,
    });

    const content: TooltipContent = {
      visible: true,
      title: "Title",
      rows: [{ label: "L", value: "V", color: "#fff", dimmed: false }],
    };

    renderTooltipBox(ctx, state, content, 120);

    // Detection should have run and cached the result
    expect(state.canvasFilterSupported).toBe(false);
    // No blur operations
    expect(filterWrites).not.toContain("blur(8px) saturate(112%)");
    expect(drawImageCalls.length).toBe(0);
  });

  it("does not draw tooltip border when border width is 0", () => {
    const { ctx, strokeCalls } = createTooltipContext({
      Title: 40,
      L: 10,
      V: 10,
    });

    const state = new WorkerState();
    state.width = 400;
    state.padding.left = 30;
    state.padding.right = 20;
    state.chartTop = 20;
    state.chartHeight = 180;
    state.tooltipPosition = "top-left";
    state.tooltipBorderWidth = 0;
    state.tooltipShowSwatch = false;

    const content: TooltipContent = {
      visible: true,
      title: "Title",
      rows: [{ label: "L", value: "V", color: "#fff", dimmed: false }],
    };

    renderTooltipBox(ctx, state, content, 120);

    expect(strokeCalls).toHaveLength(0);
  });

  it("skips tooltip shadow by default", () => {
    const { ctx, shadowColorWrites, shadowBlurWrites, shadowOffsetXWrites, shadowOffsetYWrites } =
      createTooltipContext({
        Title: 40,
        L: 10,
        V: 10,
      });

    const state = new WorkerState();
    state.width = 400;
    state.padding.left = 30;
    state.padding.right = 20;
    state.chartTop = 20;
    state.chartHeight = 180;
    state.tooltipPosition = "top-left";
    state.tooltipShowSwatch = false;

    const content: TooltipContent = {
      visible: true,
      title: "Title",
      rows: [{ label: "L", value: "V", color: "#fff", dimmed: false }],
    };

    renderTooltipBox(ctx, state, content, 120);

    expect(shadowColorWrites).toHaveLength(0);
    expect(shadowBlurWrites).toHaveLength(0);
    expect(shadowOffsetXWrites).toHaveLength(0);
    expect(shadowOffsetYWrites).toHaveLength(0);
  });

  it("draws tooltip shadow when enabled", () => {
    const { ctx, shadowColorWrites, shadowBlurWrites, shadowOffsetXWrites, shadowOffsetYWrites } =
      createTooltipContext({
        Title: 40,
        L: 10,
        V: 10,
      });

    const state = new WorkerState();
    state.width = 400;
    state.padding.left = 30;
    state.padding.right = 20;
    state.chartTop = 20;
    state.chartHeight = 180;
    state.tooltipPosition = "top-left";
    state.tooltipShowSwatch = false;
    state.tooltipShadowEnabled = true;

    const content: TooltipContent = {
      visible: true,
      title: "Title",
      rows: [{ label: "L", value: "V", color: "#fff", dimmed: false }],
    };

    renderTooltipBox(ctx, state, content, 120);

    expect(shadowColorWrites).toContain("rgba(0, 0, 0, 0.18)");
    expect(shadowBlurWrites).toContain(8);
    expect(shadowOffsetXWrites).toContain(0);
    expect(shadowOffsetYWrites).toContain(2);
  });

  it("skips tooltip shadow when disabled", () => {
    const { ctx, shadowColorWrites, shadowBlurWrites } = createTooltipContext({
      Title: 40,
      L: 10,
      V: 10,
    });

    const state = new WorkerState();
    state.width = 400;
    state.padding.left = 30;
    state.padding.right = 20;
    state.chartTop = 20;
    state.chartHeight = 180;
    state.tooltipPosition = "top-left";
    state.tooltipShowSwatch = false;
    state.tooltipShadowEnabled = false;

    const content: TooltipContent = {
      visible: true,
      title: "Title",
      rows: [{ label: "L", value: "V", color: "#fff", dimmed: false }],
    };

    renderTooltipBox(ctx, state, content, 120);

    expect(shadowColorWrites).toHaveLength(0);
    expect(shadowBlurWrites).toHaveLength(0);
  });
});

function createSelectionCtx() {
  let fillStyle = "";
  let strokeStyle = "";
  let lineWidth = 0;
  let dashPattern: number[] = [];
  let dashAtStroke: number[] = [];
  const strokeCalls: number[] = [];

  const ctx = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string) {
      fillStyle = v;
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(v: string) {
      strokeStyle = v;
    },
    get lineWidth() {
      return lineWidth;
    },
    set lineWidth(v: number) {
      lineWidth = v;
    },
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {
      strokeCalls.push(1);
      dashAtStroke = [...dashPattern];
    },
    setLineDash: (pattern: number[]) => {
      dashPattern = [...pattern];
    },
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    getFillStyle: () => fillStyle,
    getStrokeStyle: () => strokeStyle,
    getLineWidth: () => lineWidth,
    getDashAtStroke: () => dashAtStroke,
    strokeCalls,
  };
}

function selectionState(overrides: Partial<WorkerState> = {}): WorkerState {
  const state = new WorkerState();
  state.width = 400;
  state.padding.left = 30;
  state.padding.right = 20;
  state.chartWidth = 350;
  state.chartTop = 20;
  state.chartHeight = 180;
  state.viewport = { xMin: 0, xMax: 100, yMin: 0, yMax: 100 };
  state.selectionStart = 20;
  state.selectionEnd = 60;
  Object.assign(state, overrides);
  return state;
}

describe("calculateTooltipPosition touch offsets", () => {
  it("keeps touch-driven cursor tooltips above the finger with a larger gap", () => {
    const state = new WorkerState();
    state.width = 400;
    state.padding.left = 30;
    state.padding.right = 20;
    state.chartTop = 20;
    state.chartHeight = 200;
    state.mouseX = 180;
    state.mouseY = 140;
    state.pointerType = "touch";
    state.tooltipPosition = "cursor";

    const pos = calculateTooltipPosition(state, 220, 120, 60, 180);

    expect(pos).toEqual({ x: 204, y: 56 });
  });

  it("falls below the finger when there is not enough room above", () => {
    const state = new WorkerState();
    state.width = 400;
    state.padding.left = 30;
    state.padding.right = 20;
    state.chartTop = 20;
    state.chartHeight = 200;
    state.mouseX = 180;
    state.mouseY = 50;
    state.pointerType = "touch";
    state.tooltipPosition = "cursor";

    const pos = calculateTooltipPosition(state, 220, 120, 60, 180);

    expect(pos).toEqual({ x: 204, y: 74 });
  });
});

describe("drawSelectionRect rendering", () => {
  it("applies custom selectionColor to fillStyle", () => {
    const { ctx, getFillStyle } = createSelectionCtx();
    const state = selectionState({ selectionColor: "rgba(255,0,0,0.3)" });
    drawSelectionRect(ctx, state);
    expect(getFillStyle()).toBe("rgba(255,0,0,0.3)");
  });

  it("uses default COLORS.selection when no custom color", () => {
    const { ctx, getFillStyle } = createSelectionCtx();
    const state = selectionState();
    drawSelectionRect(ctx, state);
    expect(getFillStyle()).toBe(COLORS.selection);
  });

  it("skips stroke when borderWidth is 0", () => {
    const { ctx, strokeCalls } = createSelectionCtx();
    const state = selectionState({ selectionBorderWidth: 0 });
    drawSelectionRect(ctx, state);
    expect(strokeCalls).toHaveLength(0);
  });

  it("applies dashed pattern for borderStyle dashed", () => {
    const { ctx, getDashAtStroke, strokeCalls } = createSelectionCtx();
    const state = selectionState({ selectionBorderStyle: "dashed" });
    drawSelectionRect(ctx, state);
    expect(strokeCalls).toHaveLength(1);
    expect(getDashAtStroke()).toEqual([5, 3]);
  });

  it("applies dotted pattern for borderStyle dotted", () => {
    const { ctx, getDashAtStroke, strokeCalls } = createSelectionCtx();
    const state = selectionState({ selectionBorderStyle: "dotted" });
    drawSelectionRect(ctx, state);
    expect(strokeCalls).toHaveLength(1);
    expect(getDashAtStroke()).toEqual([2, 2]);
  });

  it("applies solid (no dash) for borderStyle solid", () => {
    const { ctx, getDashAtStroke, strokeCalls } = createSelectionCtx();
    const state = selectionState({ selectionBorderStyle: "solid" });
    drawSelectionRect(ctx, state);
    expect(strokeCalls).toHaveLength(1);
    expect(getDashAtStroke()).toEqual([]);
  });

  it("applies custom borderColor and borderWidth", () => {
    const { ctx, getStrokeStyle, getLineWidth, strokeCalls } = createSelectionCtx();
    const state = selectionState({
      selectionBorderColor: "#ff0000",
      selectionBorderWidth: 3,
    });
    drawSelectionRect(ctx, state);
    expect(getStrokeStyle()).toBe("#ff0000");
    expect(getLineWidth()).toBe(3);
    expect(strokeCalls).toHaveLength(1);
  });

  it("does nothing when selection is null", () => {
    const { ctx, strokeCalls, getFillStyle } = createSelectionCtx();
    const state = selectionState({ selectionStart: null, selectionEnd: null });
    drawSelectionRect(ctx, state);
    expect(strokeCalls).toHaveLength(0);
    expect(getFillStyle()).toBe("");
  });
});

describe("tooltip width ratchet", () => {
  function ratchetState(): WorkerState {
    const state = new WorkerState();
    state.width = 400;
    state.padding.left = 30;
    state.padding.right = 20;
    state.chartTop = 20;
    state.chartHeight = 200;
    state.tooltipPosition = "top-left";
    state.tooltipShowSwatch = false;
    return state;
  }

  it("ratchets up: wider content keeps the wider width", () => {
    const { ctx } = createTooltipContext({
      Title: 40,
      Short: 20,
      Val: 15,
    });
    const state = ratchetState();

    const narrow: TooltipContent = {
      visible: true,
      title: "Title",
      rows: [{ label: "Short", value: "Val", color: "#f00", dimmed: false }],
    };
    renderTooltipBox(ctx, state, narrow, 100);
    const firstWidth = state.tooltipRatchetWidth;
    expect(firstWidth).toBeGreaterThan(0);

    // Render with even narrower content — ratchet should hold
    const { ctx: ctx2 } = createTooltipContext({
      T: 10,
      S: 5,
      V: 5,
    });
    const narrower: TooltipContent = {
      visible: true,
      title: "T",
      rows: [{ label: "S", value: "V", color: "#f00", dimmed: false }],
    };
    renderTooltipBox(ctx2, state, narrower, 100);
    expect(state.tooltipRatchetWidth).toBe(firstWidth);
  });

  it("grows when content becomes wider", () => {
    const { ctx } = createTooltipContext({
      Title: 40,
      Short: 20,
      Val: 15,
    });
    const state = ratchetState();

    const narrow: TooltipContent = {
      visible: true,
      title: "Title",
      rows: [{ label: "Short", value: "Val", color: "#f00", dimmed: false }],
    };
    renderTooltipBox(ctx, state, narrow, 100);
    const firstWidth = state.tooltipRatchetWidth;

    // Wider content should increase ratchet
    const { ctx: ctx2 } = createTooltipContext({
      "Long Title": 120,
      "Long Label": 80,
      "Long Value": 60,
    });
    const wider: TooltipContent = {
      visible: true,
      title: "Long Title",
      rows: [{ label: "Long Label", value: "Long Value", color: "#f00", dimmed: false }],
    };
    renderTooltipBox(ctx2, state, wider, 100);
    expect(state.tooltipRatchetWidth).toBeGreaterThan(firstWidth);
  });

  it("resets when content.visible is false", () => {
    const { ctx } = createTooltipContext({ Title: 40, L: 20, V: 15 });
    const state = ratchetState();

    renderTooltipBox(
      ctx,
      state,
      {
        visible: true,
        title: "Title",
        rows: [{ label: "L", value: "V", color: "#f00", dimmed: false }],
      },
      100,
    );
    expect(state.tooltipRatchetWidth).toBeGreaterThan(0);

    // Hidden tooltip resets ratchet
    renderTooltipBox(ctx, state, { visible: false, title: "", rows: [] }, 100);
    expect(state.tooltipRatchetWidth).toBe(0);
  });

  it("resets via resetTooltipRatchet helper", () => {
    const { ctx } = createTooltipContext({ Title: 40, L: 20, V: 15 });
    const state = ratchetState();

    renderTooltipBox(
      ctx,
      state,
      {
        visible: true,
        title: "Title",
        rows: [{ label: "L", value: "V", color: "#f00", dimmed: false }],
      },
      100,
    );
    expect(state.tooltipRatchetWidth).toBeGreaterThan(0);

    resetTooltipRatchet(state);
    expect(state.tooltipRatchetWidth).toBe(0);
  });

  it("uses fixed width when tooltipFixedWidth is set", () => {
    const { ctx } = createTooltipContext({ T: 10, L: 5, V: 5 });
    const state = ratchetState();
    state.tooltipFixedWidth = 300;

    renderTooltipBox(
      ctx,
      state,
      {
        visible: true,
        title: "T",
        rows: [{ label: "L", value: "V", color: "#f00", dimmed: false }],
      },
      100,
    );
    // Box width should be the fixed width (natural content is much narrower)
    expect(state.tooltipRatchetWidth).toBe(300);
  });

  it("fixed width is exact even when content is wider", () => {
    const { ctx } = createTooltipContext({
      "Very Long Title Here": 280,
      "Long Label": 100,
      "Long Value": 80,
    });
    const state = ratchetState();
    state.tooltipFixedWidth = 50; // smaller than content

    renderTooltipBox(
      ctx,
      state,
      {
        visible: true,
        title: "Very Long Title Here",
        rows: [{ label: "Long Label", value: "Long Value", color: "#f00", dimmed: false }],
      },
      100,
    );
    expect(state.tooltipRatchetWidth).toBe(50);
  });
});
