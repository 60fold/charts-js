import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "packages", "line", "dist");
const forbidden = [
  "__SIXTYFOLD_LINE_BENCHMARK__",
  "benchmarkPhases",
  "benchmarkWork",
  "setupLayoutAnimationMs",
  "viewportIndicesMs",
  "yBoundsMs",
  "cachePrepMs",
  "getRenderDataMs",
  "chromeGridAxesMs",
  "rangeDrawMs",
  "rangeRasterCompositeMs",
  "rangeDrawingMs",
  "ordinaryFillMs",
  "fillEffectsMs",
  "stackedAreasMs",
  "barsMs",
  "connectedSeriesMs",
  "ordinarySeriesMs",
  "legendCacheFinalizeMs",
  "cacheDrawSubmissionMs",
  "cacheRasterizationSyncMs",
  "finalCacheBlitMs",
  "overlaysCrosshairMs",
  "rangeSelectorMs",
  "totalMs",
  "rangeRasterUsed",
  "centerPresentationPoints",
  "rangePresentationPoints",
  "denseStepRectangleCalls",
  "barRectangleCount",
];

function isProductionRuntimeOrDeclaration(name) {
  return (
    name.endsWith(".js") ||
    name.endsWith(".js.map") ||
    name.endsWith(".d.ts") ||
    name.endsWith(".d.ts.map")
  );
}

async function productionFilesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await productionFilesBelow(target)));
    } else if (entry.isFile() && isProductionRuntimeOrDeclaration(entry.name)) {
      files.push(target);
    }
  }
  return files;
}

for (const file of await productionFilesBelow(dist)) {
  const source = await readFile(file, "utf8");
  for (const marker of forbidden) {
    if (source.includes(marker)) {
      throw new Error(
        `Production Line bundle retained benchmark-only marker ${JSON.stringify(marker)} in ${path.relative(root, file)}.`,
      );
    }
  }
}

console.log(
  "Production Line runtime, source-map, and declaration artifacts contain no benchmark phase instrumentation.",
);
