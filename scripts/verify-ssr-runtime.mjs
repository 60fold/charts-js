import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createCanvas } from "@napi-rs/canvas";
import { renderLineChartSSR, renderStockChartSSR } from "../packages/ssr/dist/index.js";
import {
  installTextTracking,
  validateRasterizedTextPlacement,
  validateRasterizedTextSurvives,
} from "./ssr-text-tracking.mjs";

const WIDTH = 960;
const HEIGHT = 540;
const VISUAL_REFERENCE_VERSION = 4;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const VISUAL_GRID = { columns: 32, rows: 16 };
const VISUAL_REGIONS = {
  line: { x: 90, y: 72, width: 805, height: 368 },
  stock: { x: 57, y: 45, width: 805, height: 450 },
};
const REQUIRED_VISUAL_TEXT = {
  line: [
    {
      text: "SSR RUNTIME VERIFICATION · LINE",
      anchor: { x: 492.5, y: 64 },
      bounds: { minY: 45, maxY: 69 },
    },
    {
      text: "Throughput",
      anchor: { x: 77.5, y: 256 },
      bounds: { minX: 60, maxX: 95, minY: 190, maxY: 320 },
    },
    {
      text: "Deterministic 24-hour workload · 1,440 observed minutes",
      anchor: { x: 896, y: 480 },
      bounds: { minY: 462, maxY: 490 },
    },
    {
      text: "API requests",
      anchor: { y: 13.5 },
      bounds: { minX: 250, maxX: 700, minY: 0, maxY: 24 },
    },
    {
      text: "Inference jobs",
      anchor: { y: 13.5 },
      bounds: { minX: 250, maxX: 700, minY: 0, maxY: 24 },
    },
    {
      text: "Storage writes",
      anchor: { y: 13.5 },
      bounds: { minX: 250, maxX: 700, minY: 0, maxY: 24 },
    },
  ],
  stock: [
    {
      text: "SSR RUNTIME VERIFICATION · STOCK",
      anchor: { x: 460.5, y: 37 },
      bounds: { minY: 18, maxY: 42 },
    },
    {
      text: "Price (USDT)",
      anchor: { x: 874.5, y: 269.5 },
      bounds: { minX: 855, maxX: 895, minY: 200, maxY: 340 },
    },
    {
      text: "Deterministic OHLCV fixture · no network access",
      anchor: { x: 863, y: 534 },
      bounds: { minY: 515, maxY: 539 },
    },
  ],
};
const REQUIRED_VISUAL_TEXT_SET = new Set(
  Object.values(REQUIRED_VISUAL_TEXT)
    .flat()
    .map(({ text }) => text),
);
const renderedTextByCanvas = new WeakMap();
const visualReferenceFile = path.resolve("scripts", "ssr-visual-reference.json");
const runtime = detectRuntime();
const expectedRuntime = readArgument("--runtime");
const outputRoot = readArgument("--output-dir") ?? path.resolve("artifacts", "ssr-runtimes");
const outputDirectory = path.join(outputRoot, runtime);
const updateVisualReference = process.argv.includes("--update-visual-reference");

if (expectedRuntime) {
  assert.equal(
    runtime,
    expectedRuntime,
    `Expected ${expectedRuntime}, but the test is running under ${runtime}.`,
  );
}

let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error("SSR rendering must not perform network requests.");
};

await mkdir(outputDirectory, { recursive: true });

const visualReference = updateVisualReference
  ? undefined
  : JSON.parse(await readFile(visualReferenceFile, "utf8"));
if (visualReference) validateVisualReferenceMetadata(visualReference);
const line = renderLine();
const stock = renderStock();
const results = [];
const signatures = {};

for (const [name, canvas] of [
  ["line", line],
  ["stock", stock],
]) {
  validatePixels(name, canvas);
  const signature = createVisualSignature(name, canvas);
  signatures[name] = signature;
  const visualDifference = visualReference
    ? validateVisualSignature(name, signature, visualReference.charts?.[name])
    : undefined;
  const png = canvas.toBuffer("image/png");
  validatePng(name, png);
  const file = path.join(outputDirectory, `${name}.png`);
  await writeFile(file, png);
  results.push({
    chart: name,
    file,
    bytes: png.byteLength,
    sha256: createHash("sha256").update(png).digest("hex"),
    visualDifference,
  });
}

if (updateVisualReference) {
  assert.equal(runtime, "node", "Only the Node.js verification run may update the reference.");
  await writeFile(
    visualReferenceFile,
    `${JSON.stringify(
      {
        version: VISUAL_REFERENCE_VERSION,
        width: WIDTH,
        height: HEIGHT,
        grid: VISUAL_GRID,
        regions: VISUAL_REGIONS,
        charts: signatures,
      },
      null,
      2,
    )}\n`,
  );
}

assert.equal(fetchCalls, 0, "SSR rendering unexpectedly called fetch().");

console.log(
  JSON.stringify(
    {
      runtime,
      version: runtimeVersion(runtime),
      canvas: "@napi-rs/canvas",
      width: WIDTH,
      height: HEIGHT,
      results,
    },
    null,
    2,
  ),
);

function detectRuntime() {
  if (process.versions.bun) return "bun";
  if (process.versions.deno) return "deno";
  return "node";
}

function runtimeVersion(name) {
  return name === "node" ? process.versions.node : process.versions[name];
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value after ${name}.`);
  }
  return value;
}

function renderLine() {
  const length = 1_440;
  const x = new Float64Array(length);
  const requests = new Float64Array(length);
  const inference = new Float64Array(length);
  const storage = new Float64Array(length);
  const start = Date.UTC(2026, 6, 1);

  for (let index = 0; index < length; index += 1) {
    x[index] = start + index * 60_000;
    requests[index] = 640 + index * 0.075 + Math.sin(index / 39) * 82 + Math.sin(index / 7) * 18;
    inference[index] =
      430 + index * 0.045 + Math.sin(index / 51 + 1.2) * 58 + Math.cos(index / 11) * 13;
    storage[index] =
      255 + index * 0.022 + Math.sin(index / 66 + 2.4) * 34 + Math.cos(index / 17) * 9;
  }

  const renderedText = [];
  const rasterizedText = new Map();
  const canvas = createTrackedCanvas(WIDTH, HEIGHT, renderedText, rasterizedText);
  renderLineChartSSR(
    canvas,
    {
      x,
      series: [requests, inference, storage],
      length,
      seriesCount: 3,
    },
    {
      animated: false,
      padding: { top: 8, right: 64, bottom: 22, left: 66 },
      chartBackground: {
        type: "gradient",
        direction: "vertical",
        colors: ["#111a2e", "#0b1221"],
      },
      grid: {
        color: "rgba(115, 142, 184, 0.22)",
        textColor: "#8ea3c2",
      },
      axis: {
        color: "#466285",
        bottom: { format: "time" },
      },
      labels: {
        top: {
          text: "SSR RUNTIME VERIFICATION · LINE",
          font: { size: 17, weight: "bold", color: "#f4f7fb" },
          padding: { top: 12, bottom: 8 },
        },
        left: {
          text: "Throughput",
          font: { size: 11, color: "#8ea3c2" },
          align: "middle",
        },
        bottom: {
          text: "Deterministic 24-hour workload · 1,440 observed minutes",
          font: { size: 10, color: "#7185a4" },
          align: "right",
          padding: { top: 8 },
        },
      },
      legend: {
        visible: true,
        position: "top",
        layout: "row",
        align: "center",
        itemGap: 22,
        labelFont: { size: 11, color: "#dbe6f6" },
      },
      rangeSelector: {
        visible: true,
        height: 42,
        gap: 12,
        borderRadius: 4,
      },
      series: [
        {
          name: "API requests",
          type: "line",
          color: "#47c7ff",
          width: 2,
        },
        {
          name: "Inference jobs",
          type: "line",
          color: "#ffb22e",
          width: 2,
        },
        {
          name: "Storage writes",
          type: "line",
          color: "#49db9a",
          width: 2,
        },
      ],
    },
    {
      width: WIDTH,
      height: HEIGHT,
      dpr: 1,
      createCanvas: (width, height) =>
        createTrackedCanvas(width, height, renderedText, rasterizedText),
    },
  );
  return canvas;
}

function renderStock() {
  const length = 360;
  const timestamp = new Float64Array(length);
  const open = new Float64Array(length);
  const high = new Float64Array(length);
  const low = new Float64Array(length);
  const close = new Float64Array(length);
  const volume = new Float64Array(length);
  const start = Date.UTC(2026, 6, 1, 8);
  let previousClose = 63_400;

  for (let index = 0; index < length; index += 1) {
    const movement =
      Math.sin(index / 13) * 19 + Math.cos(index / 31) * 11 + Math.sin(index / 4.5) * 7 + 0.55;
    const nextClose = previousClose + movement;
    timestamp[index] = start + index * 60_000;
    open[index] = previousClose;
    close[index] = nextClose;
    high[index] = Math.max(previousClose, nextClose) + 11 + Math.abs(Math.sin(index)) * 13;
    low[index] = Math.min(previousClose, nextClose) - 10 - Math.abs(Math.cos(index)) * 12;
    volume[index] = 18 + Math.abs(Math.sin(index / 9)) * 42 + (index % 37 === 0 ? 65 : 0);
    previousClose = nextClose;
  }

  const renderedText = [];
  const rasterizedText = new Map();
  const canvas = createTrackedCanvas(WIDTH, HEIGHT, renderedText, rasterizedText);
  renderStockChartSSR(
    canvas,
    { timestamp, open, high, low, close, volume, length },
    {
      animated: false,
      padding: { top: 8, right: 74, bottom: 22, left: 58 },
      chartBackground: {
        type: "gradient",
        direction: "vertical",
        colors: ["#15182d", "#0c1020"],
      },
      grid: {
        color: "rgba(126, 139, 182, 0.22)",
        textColor: "#949fbe",
      },
      axis: { color: "#4d597c" },
      labels: {
        top: {
          text: "SSR RUNTIME VERIFICATION · STOCK",
          font: { size: 17, weight: "bold", color: "#f4f7fb" },
          padding: { top: 12, bottom: 8 },
        },
        right: {
          text: "Price (USDT)",
          font: { size: 11, color: "#7784a7" },
          align: "middle",
        },
        bottom: {
          text: "Deterministic OHLCV fixture · no network access",
          font: { size: 10, color: "#7180a3" },
          align: "right",
          padding: { top: 8 },
        },
      },
      showVolume: true,
      volumeHeightRatio: 0.18,
      volumeOpacity: 0.38,
      candleColors: {
        up: "#35d6a1",
        down: "#ff647c",
        wickUp: "#6be8bd",
        wickDown: "#ff8ca0",
      },
      volumeColors: {
        up: "#35d6a1",
        down: "#ff647c",
      },
      previewLineColor: "#6ea8ff",
      rangeSelector: {
        visible: false,
      },
      priceUnit: { prefix: "$", decimals: 2 },
      volumeUnit: { suffix: " BTC", decimals: 2 },
    },
    {
      width: WIDTH,
      height: HEIGHT,
      dpr: 1,
      createCanvas: (width, height) =>
        createTrackedCanvas(width, height, renderedText, rasterizedText),
    },
  );
  return canvas;
}

function createTrackedCanvas(width, height, renderedText, rasterizedText) {
  const canvas = createCanvas(width, height);
  installTextTracking(canvas, REQUIRED_VISUAL_TEXT_SET, renderedText, rasterizedText);
  renderedTextByCanvas.set(canvas, { renderedText, rasterizedText });
  return canvas;
}

function validatePixels(name, canvas) {
  const context = canvas.getContext("2d");
  assert(context, `${name}: Canvas2D context is unavailable.`);
  const pixels = context.getImageData(0, 0, WIDTH, HEIGHT).data;
  let transparent = 0;
  const sampledColors = new Set();

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) transparent += 1;
  }
  for (let y = 0; y < HEIGHT; y += 8) {
    for (let x = 0; x < WIDTH; x += 8) {
      const index = (y * WIDTH + x) * 4;
      sampledColors.add(
        `${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`,
      );
    }
  }

  assert(
    transparent < WIDTH * HEIGHT * 0.02,
    `${name}: more than 2% of the rendered image is transparent.`,
  );
  assert(
    sampledColors.size >= 24,
    `${name}: expected at least 24 sampled colors, found ${sampledColors.size}.`,
  );
}

function createVisualSignature(name, canvas) {
  const region = VISUAL_REGIONS[name];
  assert(region, `${name}: visual comparison region is missing.`);
  const context = canvas.getContext("2d");
  assert(context, `${name}: Canvas2D context is unavailable.`);
  const pixels = context.getImageData(region.x, region.y, region.width, region.height).data;
  const values = [];

  for (let row = 0; row < VISUAL_GRID.rows; row += 1) {
    const yStart = Math.floor((row * region.height) / VISUAL_GRID.rows);
    const yEnd = Math.floor(((row + 1) * region.height) / VISUAL_GRID.rows);
    for (let column = 0; column < VISUAL_GRID.columns; column += 1) {
      const xStart = Math.floor((column * region.width) / VISUAL_GRID.columns);
      const xEnd = Math.floor(((column + 1) * region.width) / VISUAL_GRID.columns);
      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;
      for (let y = yStart; y < yEnd; y += 1) {
        for (let x = xStart; x < xEnd; x += 1) {
          const index = (y * region.width + x) * 4;
          red += pixels[index];
          green += pixels[index + 1];
          blue += pixels[index + 2];
          count += 1;
        }
      }
      values.push(Math.round(red / count), Math.round(green / count), Math.round(blue / count));
    }
  }
  const tracking = renderedTextByCanvas.get(canvas) ?? {
    renderedText: [],
    rasterizedText: new Map(),
  };
  const requiredText = REQUIRED_VISUAL_TEXT[name];
  assert(requiredText, `${name}: required visual text is missing.`);
  for (const requirement of requiredText) {
    const { text } = requirement;
    assert(
      tracking.renderedText.includes(text),
      `${name}: expected rendered text was not drawn: ${text}`,
    );
    const evidence = tracking.rasterizedText.get(text);
    const minimumInk = Math.max(8, text.replace(/\s/g, "").length);
    assert(
      evidence?.changedPixels >= minimumInk && evidence.width > 0 && evidence.height > 0,
      `${name}: expected text did not produce visible pixels: ${text}`,
    );
    validateRasterizedTextSurvives(name, text, canvas, evidence, minimumInk, WIDTH, HEIGHT);
    validateRasterizedTextPlacement(name, requirement, evidence, WIDTH, HEIGHT);
  }
  return { pixels: values, text: requiredText.map(({ text }) => text) };
}

function validateVisualReferenceMetadata(reference) {
  assert.equal(
    reference.version,
    VISUAL_REFERENCE_VERSION,
    `SSR visual reference version changed; expected ${VISUAL_REFERENCE_VERSION}.`,
  );
  assert.equal(reference.width, WIDTH, "SSR visual reference width changed.");
  assert.equal(reference.height, HEIGHT, "SSR visual reference height changed.");
  assert.deepEqual(reference.grid, VISUAL_GRID, "SSR visual reference grid changed.");
  assert.deepEqual(reference.regions, VISUAL_REGIONS, "SSR visual reference regions changed.");
}

function validateVisualSignature(name, actual, expected) {
  assert(expected && typeof expected === "object", `${name}: pinned visual reference is missing.`);
  assert.deepEqual(actual.text, expected.text, `${name}: pinned rendered text changed.`);
  assert(Array.isArray(expected.pixels), `${name}: pinned pixel reference is missing.`);
  assert.equal(
    actual.pixels.length,
    expected.pixels.length,
    `${name}: visual reference shape changed.`,
  );
  const differences = actual.pixels.map((value, index) => Math.abs(value - expected.pixels[index]));
  const mean = differences.reduce((sum, value) => sum + value, 0) / differences.length;
  const sorted = [...differences].sort((left, right) => left - right);
  const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)];
  assert(
    mean <= 2 && p95 <= 6,
    `${name}: visual signature changed (mean channel delta ${mean.toFixed(2)}, p95 ${p95}; limits 2/6).`,
  );
  return { meanChannelDelta: Number(mean.toFixed(3)), p95ChannelDelta: p95 };
}

function validatePng(name, png) {
  assert(png.byteLength > 12_000, `${name}: PNG is unexpectedly small.`);
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    assert.equal(png[index], PNG_SIGNATURE[index], `${name}: invalid PNG signature.`);
  }
  assert.equal(png.readUInt32BE(16), WIDTH, `${name}: incorrect PNG width.`);
  assert.equal(png.readUInt32BE(20), HEIGHT, `${name}: incorrect PNG height.`);
}
