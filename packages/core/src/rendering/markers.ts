// Shared point-marker drawing.

import type { RenderContext2D } from "./types.js";
import { normalizeColor } from "./colorCache.js";

export interface MarkerGlowStyle {
  enabled: boolean;
  color?: string;
  blur: number;
  opacity: number;
}

function drawMarkerShape(
  ctx: RenderContext2D,
  x: number,
  y: number,
  shape: string,
  size: number,
  fillStyle: string,
  borderStyle: string,
  borderWidth: number,
): void {
  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = borderStyle;
  ctx.lineWidth = borderWidth;

  switch (shape) {
    case "square":
      ctx.beginPath();
      ctx.rect(x - size, y - size, size * 2, size * 2);
      ctx.fill();
      if (borderWidth > 0) ctx.stroke();
      break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.closePath();
      ctx.fill();
      if (borderWidth > 0) ctx.stroke();
      break;
    case "triangle": {
      ctx.beginPath();
      const h = size * Math.sqrt(3);
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + h / 2, y + size / 2);
      ctx.lineTo(x - h / 2, y + size / 2);
      ctx.closePath();
      ctx.fill();
      if (borderWidth > 0) ctx.stroke();
      break;
    }
    case "cross": {
      const innerW = 2;
      ctx.beginPath();
      ctx.moveTo(x - size, y);
      ctx.lineTo(x + size, y);
      ctx.moveTo(x, y - size);
      ctx.lineTo(x, y + size);
      if (borderWidth > 0) {
        ctx.strokeStyle = borderStyle;
        ctx.lineWidth = innerW + borderWidth * 2;
        ctx.stroke();
      }
      ctx.strokeStyle = fillStyle;
      ctx.lineWidth = innerW;
      ctx.stroke();
      break;
    }
    case "x": {
      const d = size * 0.707;
      const innerW = 2;
      ctx.beginPath();
      ctx.moveTo(x - d, y - d);
      ctx.lineTo(x + d, y + d);
      ctx.moveTo(x + d, y - d);
      ctx.lineTo(x - d, y + d);
      if (borderWidth > 0) {
        ctx.strokeStyle = borderStyle;
        ctx.lineWidth = innerW + borderWidth * 2;
        ctx.stroke();
      }
      ctx.strokeStyle = fillStyle;
      ctx.lineWidth = innerW;
      ctx.stroke();
      break;
    }
    case "line": {
      const innerW = 2;
      ctx.beginPath();
      ctx.moveTo(x - size, y);
      ctx.lineTo(x + size, y);
      if (borderWidth > 0) {
        ctx.strokeStyle = borderStyle;
        ctx.lineWidth = innerW + borderWidth * 2;
        ctx.stroke();
      }
      ctx.strokeStyle = fillStyle;
      ctx.lineWidth = innerW;
      ctx.stroke();
      break;
    }
    default: // "circle"
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      if (borderWidth > 0) ctx.stroke();
      break;
  }
}

/** Draw a marker shape at the given position */
export function drawMarker(
  ctx: RenderContext2D,
  x: number,
  y: number,
  shape: string,
  size: number,
  fillColor: string,
  borderColor: string,
  borderWidth: number,
  glow?: MarkerGlowStyle,
): void {
  if (!Number.isFinite(size) || size <= 0) return;

  const safeBorderWidth = Number.isFinite(borderWidth) && borderWidth > 0 ? borderWidth : 0;
  const normFill = normalizeColor(fillColor);
  const normBorder = normalizeColor(borderColor);
  const useGlow = Boolean(
    glow &&
    glow.enabled &&
    Number.isFinite(glow.blur) &&
    glow.blur > 0 &&
    Number.isFinite(glow.opacity) &&
    glow.opacity > 0,
  );

  if (useGlow && glow) {
    const glowColor = normalizeColor(glow.color ?? fillColor);
    const clampedOpacity = Math.max(0, Math.min(1, glow.opacity));
    const currentAlpha = Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1;
    ctx.save();
    ctx.shadowBlur = glow.blur;
    ctx.shadowColor = glowColor;
    ctx.globalAlpha = currentAlpha * clampedOpacity;
    drawMarkerShape(ctx, x, y, shape, size, glowColor, glowColor, 0);
    ctx.restore();
  }

  drawMarkerShape(ctx, x, y, shape, size, normFill, normBorder, safeBorderWidth);
}
