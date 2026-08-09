import assert from "node:assert/strict";

export function installTextTracking(canvas, requiredText, renderedText, rasterizedText) {
  const { width, height } = canvas;
  const context = canvas.getContext("2d");
  assert(context, "Canvas2D context is unavailable while installing text verification.");
  const nativeFillText = context.fillText;
  context.fillText = function (text, ...args) {
    const value = String(text);
    renderedText.push(value);
    const before = requiredText.has(value)
      ? context.getImageData(0, 0, width, height).data
      : undefined;
    const anchor = before ? resolveTextAnchor(context, args[0], args[1]) : undefined;
    const result = nativeFillText.call(this, text, ...args);
    if (before) {
      const after = context.getImageData(0, 0, width, height).data;
      const evidence = {
        ...measureRasterizedText(before, after, width, height),
        ...anchor,
        canvas,
      };
      // Layout may draw the same label more than once. The last draw is the one
      // that can survive into the returned canvas; never select a discarded pass
      // by comparing font-dependent raster sizes.
      rasterizedText.set(value, evidence);
    }
    return result;
  };
}

export function validateRasterizedTextSurvives(
  name,
  text,
  canvas,
  evidence,
  minimumInk,
  width,
  height,
) {
  assert.equal(
    evidence.canvas.width,
    width,
    `${name}: required text was last drawn on an unexpectedly sized canvas: ${text}`,
  );
  assert.equal(
    evidence.canvas.height,
    height,
    `${name}: required text was last drawn on an unexpectedly sized canvas: ${text}`,
  );
  const context = canvas.getContext("2d");
  assert(context, `${name}: Canvas2D context is unavailable for final text verification.`);
  const finalPixels = context.getImageData(0, 0, width, height).data;
  let retainedPixels = 0;
  for (const [index, red, green, blue, alpha] of evidence.changedPixelValues) {
    if (
      finalPixels[index] === red &&
      finalPixels[index + 1] === green &&
      finalPixels[index + 2] === blue &&
      finalPixels[index + 3] === alpha
    ) {
      retainedPixels += 1;
    }
  }
  const minimumRetained = Math.max(minimumInk, Math.floor(evidence.changedPixels * 0.8));
  assert(
    retainedPixels >= minimumRetained,
    `${name}: required text did not survive into the final image: ${text} ` +
      `(${retainedPixels}/${evidence.changedPixels} rasterized pixels retained).`,
  );
}

export function validateRasterizedTextPlacement(
  name,
  requirement,
  evidence,
  canvasWidth,
  canvasHeight,
) {
  const tolerance = 0.01;
  for (const [axis, expected] of Object.entries(requirement.anchor ?? {})) {
    const actual = axis === "x" ? evidence.anchorX : evidence.anchorY;
    assert(
      Math.abs(actual - expected) <= tolerance,
      `${name}: text anchor moved for ${requirement.text} (${axis}=${actual}; expected ${expected}).`,
    );
  }

  const right = evidence.x + evidence.width;
  const bottom = evidence.y + evidence.height;
  const { minX = 0, minY = 0, maxX = canvasWidth, maxY = canvasHeight } = requirement.bounds ?? {};
  assert(
    evidence.x >= minX && evidence.y >= minY && right <= maxX && bottom <= maxY,
    `${name}: rasterized text left its layout region for ${requirement.text} ` +
      `(bbox ${evidence.x},${evidence.y},${evidence.width},${evidence.height}; ` +
      `region ${minX},${minY}..${maxX},${maxY}).`,
  );
}

function resolveTextAnchor(context, x, y) {
  const transform = context.getTransform();
  return {
    anchorX: transform.a * Number(x) + transform.c * Number(y) + transform.e,
    anchorY: transform.b * Number(x) + transform.d * Number(y) + transform.f,
  };
}

function measureRasterizedText(before, after, width, height) {
  let changedPixels = 0;
  const changedPixelValues = [];
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4;
    if (
      before[index] === after[index] &&
      before[index + 1] === after[index + 1] &&
      before[index + 2] === after[index + 2] &&
      before[index + 3] === after[index + 3]
    ) {
      continue;
    }
    changedPixels += 1;
    changedPixelValues.push([
      index,
      after[index],
      after[index + 1],
      after[index + 2],
      after[index + 3],
    ]);
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    changedPixels,
    x: maxX >= minX ? minX : 0,
    y: maxY >= minY ? minY : 0,
    width: maxX >= minX ? maxX - minX + 1 : 0,
    height: maxY >= minY ? maxY - minY + 1 : 0,
    changedPixelValues,
  };
}
