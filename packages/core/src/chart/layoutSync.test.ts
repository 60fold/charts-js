import { describe, expect, it } from "vitest";
import { resolveRendererLayoutSync } from "./layoutSync";

const padding = { top: 20, right: 80, bottom: 40, left: 80 };

describe("resolveRendererLayoutSync", () => {
  it("returns null when the renderer did not send layout padding", () => {
    expect(
      resolveRendererLayoutSync({
        data: { xAxisHeight: 18 },
        padding,
        xAxisHeight: 0,
        canvasWidth: 800,
      }),
    ).toBeNull();
  });

  it("updates x-axis height without recalculating chart width when padding is unchanged", () => {
    const result = resolveRendererLayoutSync({
      data: { padding, xAxisHeight: 18 },
      padding,
      xAxisHeight: 0,
      canvasWidth: 800,
    });

    expect(result).toEqual({
      padding,
      xAxisHeight: 18,
      chartWidth: undefined,
    });
  });

  it("recalculates chart width when renderer padding changes", () => {
    const result = resolveRendererLayoutSync({
      data: {
        padding: { top: 20, right: 100, bottom: 40, left: 90 },
        xAxisHeight: 18,
      },
      padding,
      xAxisHeight: 0,
      canvasWidth: 800,
    });

    expect(result).toEqual({
      padding: { top: 20, right: 100, bottom: 40, left: 90 },
      xAxisHeight: 18,
      chartWidth: 610,
    });
  });
});
