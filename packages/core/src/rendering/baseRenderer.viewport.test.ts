import { describe, expect, it } from "vitest";
import { WorkerState, drawGrid, handleBaseMessage, zoom, zoomAnimated } from "./baseRenderer";

function createGridContext(): CanvasRenderingContext2D {
  return {
    beginPath() {},
    lineTo() {},
    moveTo() {},
    stroke() {},
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: "",
  } as unknown as CanvasRenderingContext2D;
}

function createFullRangeState(): WorkerState {
  const state = new WorkerState();
  state.dataBounds = { xMin: 100, xMax: 1_100, yMin: 0, yMax: 100 };
  state.viewport = { xMin: 100, xMax: 1_100, yMin: 0, yMax: 100 };
  state.cacheValid = true;
  state.animated = true;
  return state;
}

describe("viewport zoom bounds", () => {
  it("keeps the plot cache valid when instant zoom-out is already clamped", () => {
    const state = createFullRangeState();

    zoom(state, 1.1, 600, 1);

    expect(state.viewport).toMatchObject({ xMin: 100, xMax: 1_100 });
    expect(state.cacheValid).toBe(true);
  });

  it("does not start a no-op zoom animation at the full data extent", () => {
    const state = createFullRangeState();
    state.viewportAnimation.active = true;
    state.viewportAnimation.toViewport = {
      xMin: 200,
      xMax: 1_000,
      yMin: 0,
      yMax: 100,
    };

    zoomAnimated(state, 1.1, 600, 1, 50);

    expect(state.viewportAnimation.active).toBe(false);
    expect(state.cacheValid).toBe(true);
  });
});

describe("viewport input batches", () => {
  function createState(viewport = { xMin: 200, xMax: 800, yMin: 0, yMax: 100 }): WorkerState {
    const state = new WorkerState();
    state.dataBounds = { xMin: 0, xMax: 1_000, yMin: 0, yMax: 100 };
    state.viewport = { ...viewport };
    state.cacheValid = true;
    return state;
  }

  it("replays pans in order so intermediate boundary clamps stay observable", () => {
    const state = createState({
      xMin: 800,
      xMax: 1_000,
      yMin: 0,
      yMax: 100,
    });

    expect(
      handleBaseMessage(
        state,
        "viewportInputBatch",
        {
          commands: [
            { type: "pan", dx: 0.5 },
            { type: "pan", dx: -0.5 },
          ],
        },
        1,
      ),
    ).toBe(true);

    // Summing these commands to zero would incorrectly leave [800, 1000].
    expect(state.viewport).toMatchObject({ xMin: 700, xMax: 900 });
  });

  it("matches direct delivery for mixed zoom and pan commands", () => {
    const commands = [
      { type: "zoom", factor: 0.5, centerX: 300 },
      { type: "pan", dx: 0.25 },
      { type: "zoom", factor: 1.1, centerX: 600 },
    ] as const;
    const direct = createState();
    const batched = createState();

    for (const command of commands) {
      handleBaseMessage(direct, command.type, command, 10);
    }
    handleBaseMessage(batched, "viewportInputBatch", { commands }, 10);

    expect(batched.viewport).toEqual(direct.viewport);
    expect(batched.cacheValid).toBe(direct.cacheValid);
  });

  it("ignores malformed batch entries without dropping valid commands", () => {
    const state = createState();

    handleBaseMessage(
      state,
      "viewportInputBatch",
      {
        commands: [
          null,
          "pan",
          { type: "pan", dx: Number.NaN },
          { type: "zoom", factor: -1, centerX: 300 },
          { type: "zoom", factor: 0.5, centerX: Number.POSITIVE_INFINITY },
          { type: "pan", dx: 0.25 },
        ],
      },
      1,
    );

    expect(state.viewport).toMatchObject({ xMin: 350, xMax: 950 });
  });

  it("replaces stale grid ticks immediately after direct wheel input", () => {
    const state = createState();
    state.width = 800;
    state.height = 400;
    state.chartWidth = 700;
    state.chartHeight = 300;
    state.chartTop = 20;
    state.xGridAlphas.set(-100, 0.8);
    state.yGridAlphas.set(-100, 0.8);

    handleBaseMessage(
      state,
      "viewportInputBatch",
      {
        commands: [{ type: "zoom", factor: 0.5, centerX: 500 }],
      },
      1,
    );

    drawGrid(createGridContext(), state);

    expect(state.xGridAlphas.has(-100)).toBe(false);
    expect(state.yGridAlphas.has(-100)).toBe(false);
    expect(state.xGridAlphas.size).toBeGreaterThan(0);
    expect(state.yGridAlphas.size).toBeGreaterThan(0);
    expect([...state.xGridAlphas.values()].every((alpha) => alpha === 1)).toBe(true);
    expect([...state.yGridAlphas.values()].every((alpha) => alpha === 1)).toBe(true);
  });

  it("retains grid fades for authored viewport animations", () => {
    const state = createState();
    state.width = 800;
    state.height = 400;
    state.chartWidth = 700;
    state.chartHeight = 300;
    state.chartTop = 20;

    handleBaseMessage(state, "zoomAnimated", { factor: 0.5, centerX: 500 }, 1);

    drawGrid(createGridContext(), state);

    expect([...state.xGridAlphas.values()].some((alpha) => alpha > 0 && alpha < 1)).toBe(true);
  });

  it("settles active viewport, Y-domain, and reveal animations when animation is disabled", () => {
    const state = createState();
    state.animated = true;
    state.viewportAnimation.active = true;
    state.viewportAnimation.toViewport = {
      xMin: 300,
      xMax: 700,
      yMin: 20,
      yMax: 80,
    };
    state.yAnimation.active = true;
    state.yAnimation.toYMin = 20;
    state.yAnimation.toYMax = 80;
    state.revealProgress = 0.4;
    state.cacheValid = true;
    state.rangePreviewValid = true;

    expect(handleBaseMessage(state, "setAnimated", { animated: false }, 1)).toBe(true);

    expect(state.animated).toBe(false);
    expect(state.viewport).toEqual({ xMin: 300, xMax: 700, yMin: 20, yMax: 80 });
    expect(state.viewportAnimation.active).toBe(false);
    expect(state.yAnimation.active).toBe(false);
    expect(state.revealProgress).toBe(1);
    expect(state.cacheValid).toBe(false);
    expect(state.rangePreviewValid).toBe(false);
  });

  it("reenables future animation without changing the current frame", () => {
    const state = createState();
    const viewport = { ...state.viewport };

    expect(handleBaseMessage(state, "setAnimated", { animated: true }, 1)).toBe(true);

    expect(state.animated).toBe(true);
    expect(state.viewport).toEqual(viewport);
  });
});
