import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const rendererContract = [
  "CanvasLike",
  "EngineCallbacks",
  "RenderContext2D",
  "ResolvedTextDirection",
  "SerializedRendererError",
  "TooltipContent",
  "UnitOptions",
  "WorkerState",
  "applyCanvasTextDirection",
  "applyPadding",
  "applyStatsConfigFromMessage",
  "createStatsState",
  "createRendererScheduler",
  "deserializeRendererError",
  "drawAxes",
  "drawAxisLabel",
  "drawBackground",
  "drawCrosshairLines",
  "drawCustomLabels",
  "drawGrid",
  "drawLabels",
  "drawMarker",
  "drawRangeSelectorOverlay",
  "drawSelectionRect",
  "formatTooltipTitle",
  "formatValue",
  "get2dContext",
  "getCachedRgba",
  "handleBaseMessage",
  "handleTooltipContentMessage",
  "hasActiveGridAnimations",
  "isOpaqueColor",
  "isRtlTextDirection",
  "measureLabelSpace",
  "parseAxisConfig",
  "parseAxisCursorUnits",
  "parseCrosshairStyle",
  "parseGridConfig",
  "parseLabelsConfig",
  "parseOverlayConfig",
  "parseRangeSelectorConfig",
  "parseSelectionConfig",
  "parseTextDirectionConfig",
  "parseTooltipConfig",
  "renderTooltipBox",
  "replaceChartBackground",
  "resetTooltipRatchet",
  "resolveCanvasTextAlign",
  "savePaddingBase",
  "serializeRendererError",
  "setViewportRangeAnimated",
  "setYViewport",
  "shouldEmitStats",
  "startRevealAnimation",
  "updateFPS",
  "updateRevealAnimation",
  "updateViewportAnimation",
  "updateYAnimation",
].sort();

function readCuratedExports(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const exports: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
      throw new Error("The internal renderer contract must not use wildcard exports.");
    }
    exports.push(...statement.exportClause.elements.map((element) => element.name.text));
  }

  return exports;
}

describe("@sixtyfold/core package surface", () => {
  it("keeps renderer implementation details behind the internal contract", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(root, "packages/core/package.json"), "utf8"),
    ) as {
      exports?: Record<string, unknown>;
    };

    expect(manifest.exports).not.toHaveProperty("./rendering/baseRenderer");
    expect(manifest.exports).toHaveProperty("./internal/renderer");
  });

  it("pins every name in the curated internal renderer contract", async () => {
    const file = resolve(root, "packages/core/src/internal/renderer.ts");
    const source = await readFile(file, "utf8");
    const exports = readCuratedExports(file, source);

    expect(exports.sort()).toEqual(rendererContract);
  });

  it("rejects wildcard exports from the internal renderer contract", () => {
    expect(() =>
      readCuratedExports("renderer.ts", 'export * from "../rendering/baseRenderer.js";'),
    ).toThrow("must not use wildcard exports");
  });
});
