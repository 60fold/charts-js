export interface ChartPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface RendererLayoutSyncResult {
  padding: ChartPadding;
  xAxisHeight: number;
  chartWidth?: number;
}

export function resolveRendererLayoutSync(options: {
  data: Record<string, unknown>;
  padding: ChartPadding;
  xAxisHeight: number;
  canvasWidth: number;
}): RendererLayoutSyncResult | null {
  const p = options.data.padding as Record<string, unknown> | undefined;
  if (!p) return null;

  const nextPadding = { ...options.padding };
  let paddingChanged = false;

  const updateSide = (side: keyof ChartPadding) => {
    const raw = p[side];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return;
    if (nextPadding[side] !== raw) {
      nextPadding[side] = raw;
      paddingChanged = true;
    }
  };

  updateSide("top");
  updateSide("right");
  updateSide("bottom");
  updateSide("left");

  let nextXAxisHeight = options.xAxisHeight;
  const xah = options.data.xAxisHeight;
  if (typeof xah === "number" && Number.isFinite(xah) && xah >= 0) {
    nextXAxisHeight = xah;
  }

  if (!paddingChanged && nextXAxisHeight === options.xAxisHeight) return null;

  return {
    padding: paddingChanged ? nextPadding : options.padding,
    xAxisHeight: nextXAxisHeight,
    chartWidth: paddingChanged
      ? options.canvasWidth - nextPadding.left - nextPadding.right
      : undefined,
  };
}
