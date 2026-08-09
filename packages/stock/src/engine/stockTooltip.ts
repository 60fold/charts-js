import type { TooltipContent } from "@sixtyfold/core/internal/renderer";
import type { StockIndicator } from "../analytics.js";

export interface StockTooltipCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface StockIndicatorReading {
  id: string;
  label: string;
  value: number;
  formattedValue: string;
  color: string;
}

export interface StockTooltipContentOptions {
  title: string;
  candle: StockTooltipCandle;
  indicatorReadings: readonly StockIndicatorReading[];
  fields?: readonly string[] | null;
  fieldLabels: Readonly<Record<string, string | undefined>>;
  formatPrice: (value: number) => string;
  formatVolume: (value: number) => string;
  upColor: string;
  downColor: string;
}

const STOCK_DEFAULT_FIELDS = [
  "open",
  "high",
  "low",
  "close",
  "change",
  "changePercent",
  "volume",
] as const;

export function getIndicatorBaseId(definition: StockIndicator, index: number): string {
  if (definition.id) return definition.id;
  if (definition.type === "vwap") {
    return `vwap-${definition.reset ?? "day"}-${index}`;
  }
  return `${definition.type}-${definition.period}-${index}`;
}

export function getIndicatorBaseLabel(definition: StockIndicator): string {
  if (definition.label) return definition.label;
  switch (definition.type) {
    case "sma":
      return `SMA ${definition.period}`;
    case "ema":
      return `EMA ${definition.period}`;
    case "bollinger":
      return `BB ${definition.period}`;
    case "vwap":
      return "VWAP";
  }
}

export function buildStockTooltipContent(options: StockTooltipContentOptions): TooltipContent {
  const {
    title,
    candle,
    indicatorReadings,
    fields,
    fieldLabels,
    formatPrice,
    formatVolume,
    upColor,
    downColor,
  } = options;
  const isUp = candle.c >= candle.o;
  const change = candle.c - candle.o;
  const changePercent = candle.o !== 0 ? (change / candle.o) * 100 : 0;
  const sign = change >= 0 ? "+" : "";
  const changeColor = isUp ? upColor : downColor;

  const allRows: Record<string, TooltipContent["rows"][number]> = {
    open: {
      label: fieldLabels.open ?? "",
      value: formatPrice(candle.o),
      color: "#eee",
      dimmed: false,
    },
    high: {
      label: fieldLabels.high ?? "",
      value: formatPrice(candle.h),
      color: "#eee",
      dimmed: false,
    },
    low: {
      label: fieldLabels.low ?? "",
      value: formatPrice(candle.l),
      color: "#eee",
      dimmed: false,
    },
    close: {
      label: fieldLabels.close ?? "",
      value: formatPrice(candle.c),
      color: "#eee",
      dimmed: false,
    },
    change: {
      label: fieldLabels.change ?? "",
      value: `${sign}${formatPrice(change)}`,
      color: changeColor,
      dimmed: false,
    },
    changePercent: {
      label: fieldLabels.changePercent ?? "",
      value: `${sign}${changePercent.toFixed(2)}%`,
      color: changeColor,
      dimmed: false,
    },
    volume: {
      label: fieldLabels.volume ?? "",
      value: formatVolume(candle.v),
      color: "#eee",
      dimmed: false,
    },
  };

  const rows: TooltipContent["rows"] = [];
  for (const field of fields ?? STOCK_DEFAULT_FIELDS) {
    const row = allRows[field];
    if (row) rows.push(row);
  }
  for (const indicator of indicatorReadings) {
    rows.push({
      label: indicator.label,
      value: indicator.formattedValue,
      color: indicator.color,
      dimmed: false,
    });
  }

  return { visible: true, title, rows };
}
