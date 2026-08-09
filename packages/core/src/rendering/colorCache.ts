// Shared color parsing and bounded caches for renderer hot paths.
export const colorCache = new Map<string, string>();
const MAX_COLOR_CACHE_SIZE = 4096;

let colorParserCtx: Pick<CanvasRenderingContext2D, "fillStyle"> | null | undefined;

function clampAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) return 1;
  const clamped = Math.max(0, Math.min(1, alpha));
  return Math.round(clamped * 1000) / 1000;
}

function parseHexColor(color: string): { r: number; g: number; b: number; a: number } | null {
  if (color[0] !== "#") return null;

  if (color.length === 4 || color.length === 5) {
    const r = parseInt(color[1] + color[1], 16);
    const g = parseInt(color[2] + color[2], 16);
    const b = parseInt(color[3] + color[3], 16);
    const a = color.length === 5 ? parseInt(color[4] + color[4], 16) / 255 : 1;
    if ([r, g, b, a].every(Number.isFinite)) return { r, g, b, a };
    return null;
  }

  if (color.length === 7 || color.length === 9) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const a = color.length === 9 ? parseInt(color.slice(7, 9), 16) / 255 : 1;
    if ([r, g, b, a].every(Number.isFinite)) return { r, g, b, a };
  }

  return null;
}

function parseRgbColor(color: string): { r: number; g: number; b: number; a: number } | null {
  const match = color
    .trim()
    .match(
      /^rgba?\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)(?:\s*,\s*([+-]?\d*\.?\d+))?\s*\)$/i,
    );
  if (!match) return null;

  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const a = match[4] === undefined ? 1 : Number(match[4]);
  if ([r, g, b, a].every(Number.isFinite)) return { r, g, b, a };
  return null;
}

function getColorParserContext(): Pick<CanvasRenderingContext2D, "fillStyle"> | null {
  if (colorParserCtx !== undefined) return colorParserCtx;
  colorParserCtx = null;

  if (typeof OffscreenCanvas !== "undefined") {
    colorParserCtx = new OffscreenCanvas(1, 1).getContext("2d");
  } else if (typeof document !== "undefined") {
    colorParserCtx = document.createElement("canvas").getContext("2d");
  }

  return colorParserCtx;
}

function parseCssColor(color: string): { r: number; g: number; b: number; a: number } | null {
  const direct = parseHexColor(color) ?? parseRgbColor(color);
  if (direct) return direct;

  const parser = getColorParserContext();
  if (!parser) return null;

  parser.fillStyle = "#010203";
  const firstSentinel = String(parser.fillStyle);
  parser.fillStyle = color;
  let normalized = String(parser.fillStyle);
  if (normalized === firstSentinel) {
    parser.fillStyle = "#040506";
    const secondSentinel = String(parser.fillStyle);
    parser.fillStyle = color;
    normalized = String(parser.fillStyle);
    if (normalized === secondSentinel) return null;
  }
  return parseHexColor(normalized) ?? parseRgbColor(normalized);
}

const opaqueColorCache = new Map<string, boolean>();
const MAX_OPAQUE_COLOR_CACHE_SIZE = 256;

/** True only when the supplied CSS color can be resolved as fully opaque. */
export function isOpaqueColor(color: string): boolean {
  const cached = opaqueColorCache.get(color);
  if (cached !== undefined) return cached;

  const parsed = parseCssColor(color);
  const opaque = parsed !== null && parsed.a >= 1;
  if (opaqueColorCache.size >= MAX_OPAQUE_COLOR_CACHE_SIZE) {
    opaqueColorCache.clear();
  }
  opaqueColorCache.set(color, opaque);
  return opaque;
}

export function getCachedRgba(color: string, alpha: number): string {
  // Clamp alpha to 3 decimals to avoid cache explosion with animated alphas.
  const a = clampAlpha(alpha);
  const key = `${color}-${a}`;
  let rgba = colorCache.get(key);
  if (!rgba) {
    const parsed = parseCssColor(color);
    if (parsed) {
      rgba = `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${clampAlpha(parsed.a * a)})`;
    } else {
      // Preserve the original color when the runtime cannot parse it.
      rgba = a >= 1 ? color : `color-mix(in srgb, ${color} ${a * 100}%, transparent)`;
    }
    if (colorCache.size >= MAX_COLOR_CACHE_SIZE) {
      colorCache.clear();
    }
    colorCache.set(key, rgba);
  }
  return rgba;
}

const normalizedColorCache = new Map<string, string>();
const MAX_NORMALIZED_COLOR_CACHE_SIZE = 256;

// Normalize 8-digit hex colors for Canvas implementations that reject them.
export function normalizeColor(color: string): string {
  const cached = normalizedColorCache.get(color);
  if (cached !== undefined) return cached;

  let normalized = color;
  if (color.length === 9 && color[0] === "#") {
    const parsed = parseHexColor(color);
    if (parsed) {
      normalized = `rgba(${parsed.r},${parsed.g},${parsed.b},${parsed.a})`;
    }
  }

  if (normalizedColorCache.size >= MAX_NORMALIZED_COLOR_CACHE_SIZE) {
    normalizedColorCache.clear();
  }
  normalizedColorCache.set(color, normalized);
  return normalized;
}
