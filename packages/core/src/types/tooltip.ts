// Tooltip customization types

/** Parameters passed to the tooltip onRender callback */
export interface TooltipRenderParams {
  dataX: number;
  screenX: number;
  screenY: number;
  series: {
    index: number;
    name?: string;
    value: number;
    /** Value formatted with unit config (prefix, suffix, decimals) */
    formattedValue: string;
    /** Lower bound for range/band series, when available */
    low?: number;
    /** Upper bound for range/band series, when available */
    high?: number;
    /** Lower bound formatted with unit config, when available */
    formattedLow?: string;
    /** Upper bound formatted with unit config, when available */
    formattedHigh?: string;
    color: string;
    interpolated: boolean;
  }[];
  /** Default tooltip content — spread and modify instead of building from scratch */
  defaults: TooltipRenderResult;
}

/** Result returned from the tooltip onRender callback */
export interface TooltipRenderResult {
  visible?: boolean;
  title?: string;
  rows?: {
    label: string;
    value: string;
    color?: string;
    dimmed?: boolean;
  }[];
}

/** Parameters passed to the stock chart tooltip onRender callback */
export interface StockTooltipRenderParams {
  /** Candle timestamp (same units as data) */
  timestamp: number;
  screenX: number;
  screenY: number;
  /** OHLCV candle data */
  candle: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  /** Pre-formatted price/volume strings */
  formatted: {
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  };
  /** Computed analytics */
  change: number;
  changePercent: number;
  /** Absolute change formatted with price unit config */
  formattedChange: string;
  /** True if close >= open (bullish) */
  bullish: boolean;
  /** Candle color (green/red based on direction) */
  color: string;
  /** Worker-computed indicator readings aligned to this candle. */
  indicators?: {
    id: string;
    label: string;
    value: number;
    formattedValue: string;
    color: string;
  }[];
  /** Default tooltip content — spread and modify instead of building from scratch */
  defaults: TooltipRenderResult;
}

/** Result returned from stock tooltip onRender (same shape as line chart) */
export type StockTooltipRenderResult = TooltipRenderResult;

/** Available fields for stock chart tooltip rows */
export type StockTooltipField =
  "open" | "high" | "low" | "close" | "change" | "changePercent" | "volume";

/** Resolved content stored in worker for rendering */
export interface TooltipContent {
  visible: boolean;
  title: string;
  rows: {
    label: string;
    value: string;
    color: string;
    dimmed: boolean;
  }[];
}
