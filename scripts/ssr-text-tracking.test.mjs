import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import {
  installTextTracking,
  validateRasterizedTextPlacement,
  validateRasterizedTextSurvives,
} from "./ssr-text-tracking.mjs";

const WIDTH = 180;
const HEIGHT = 90;
const TITLE = "VISIBLE TITLE";

test("SSR text tracking selects the final draw even when an earlier draw has more ink", () => {
  const renderedText = [];
  const rasterizedText = new Map();
  const requiredText = new Set([TITLE]);
  const discarded = createTrackedCanvas(requiredText, renderedText, rasterizedText);
  const discardedContext = discarded.getContext("2d");
  discardedContext.fillStyle = "#ffffff";
  discardedContext.font = "bold 24px sans-serif";
  discardedContext.fillText(TITLE, 8, 28);
  const discardedInk = rasterizedText.get(TITLE).changedPixels;

  const shipped = createTrackedCanvas(requiredText, renderedText, rasterizedText);
  const shippedContext = shipped.getContext("2d");
  shippedContext.fillStyle = "#ffffff";
  shippedContext.font = "10px sans-serif";
  shippedContext.fillText(TITLE, 8, 70);
  const evidence = rasterizedText.get(TITLE);

  assert.equal(evidence.anchorY, 70);
  assert.ok(evidence.changedPixels < discardedInk);
  assert.doesNotThrow(() =>
    validateRasterizedTextSurvives(
      "line",
      TITLE,
      shipped,
      evidence,
      TITLE.replace(/\s/g, "").length,
      WIDTH,
      HEIGHT,
    ),
  );
});

test("SSR text tracking rejects a final draw cleared from the shipped canvas", () => {
  const renderedText = [];
  const rasterizedText = new Map();
  const requiredText = new Set([TITLE]);
  const shipped = createTrackedCanvas(requiredText, renderedText, rasterizedText);
  const context = shipped.getContext("2d");
  context.fillStyle = "#ffffff";
  context.font = "12px sans-serif";
  context.fillText(TITLE, 8, 60);
  const evidence = rasterizedText.get(TITLE);
  context.clearRect(0, 0, WIDTH, HEIGHT);

  assert.throws(
    () =>
      validateRasterizedTextSurvives(
        "line",
        TITLE,
        shipped,
        evidence,
        TITLE.replace(/\s/g, "").length,
        WIDTH,
        HEIGHT,
      ),
    /required text did not survive into the final image/,
  );
});

test("SSR text placement tracks a non-identity canvas transform and rejects overflow", () => {
  const renderedText = [];
  const rasterizedText = new Map();
  const requiredText = new Set([TITLE]);
  const shipped = createTrackedCanvas(requiredText, renderedText, rasterizedText);
  const context = shipped.getContext("2d");
  context.fillStyle = "#ffffff";
  context.font = "10px sans-serif";
  context.setTransform(1.5, 0.25, 0.2, 1.25, 10, 5);
  context.fillText(TITLE, 20, 30);
  const evidence = rasterizedText.get(TITLE);

  assert.ok(Math.abs(evidence.anchorX - 46) < 0.001);
  assert.ok(Math.abs(evidence.anchorY - 47.5) < 0.001);
  assert.doesNotThrow(() =>
    validateRasterizedTextPlacement("line", { text: TITLE }, evidence, WIDTH, HEIGHT),
  );
  assert.doesNotThrow(() =>
    validateRasterizedTextPlacement(
      "line",
      {
        text: TITLE,
        anchor: { x: 46, y: 47.5 },
        bounds: { minX: 0, minY: 0, maxX: WIDTH, maxY: HEIGHT },
      },
      evidence,
      WIDTH,
      HEIGHT,
    ),
  );
  assert.throws(
    () =>
      validateRasterizedTextPlacement(
        "line",
        {
          text: TITLE,
          bounds: { maxX: evidence.x + evidence.width - 1 },
        },
        evidence,
        WIDTH,
        HEIGHT,
      ),
    /rasterized text left its layout region/,
  );
});

function createTrackedCanvas(requiredText, renderedText, rasterizedText) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  installTextTracking(canvas, requiredText, renderedText, rasterizedText);
  return canvas;
}
