import { describe, expect, it, vi } from "vitest";
import type { StockIndicator } from "../analytics.js";
import {
  buildStockTooltipContent,
  getIndicatorBaseId,
  getIndicatorBaseLabel,
} from "./stockTooltip.js";

describe("stock indicator tooltip identity", () => {
  it("uses explicit identity and derives stable defaults", () => {
    const explicit = {
      type: "sma",
      period: 20,
      id: "trend",
      label: "Trend",
    } satisfies StockIndicator;
    const vwap = {
      type: "vwap",
      reset: "week",
    } satisfies StockIndicator;

    expect(getIndicatorBaseId(explicit, 2)).toBe("trend");
    expect(getIndicatorBaseLabel(explicit)).toBe("Trend");
    expect(getIndicatorBaseId(vwap, 3)).toBe("vwap-week-3");
    expect(getIndicatorBaseLabel(vwap)).toBe("VWAP");
    expect(getIndicatorBaseLabel({ type: "bollinger", period: 12 })).toBe("BB 12");
  });
});

describe("stock tooltip content", () => {
  const fieldLabels = {
    open: "Open",
    high: "High",
    low: "Low",
    close: "Close",
    change: "Change",
    changePercent: "Change %",
    volume: "Volume",
  };

  it("builds localized rows and appends indicator readings", () => {
    const formatPrice = vi.fn((value: number) => `$${value.toFixed(2)}`);
    const formatVolume = vi.fn((value: number) => `${value.toFixed(0)} BTC`);
    const content = buildStockTooltipContent({
      title: "24 July",
      candle: { t: 1, o: 100, h: 112, l: 98, c: 110, v: 42 },
      indicatorReadings: [
        {
          id: "sma-20-0",
          label: "SMA 20",
          value: 105,
          formattedValue: "$105.00",
          color: "#f59e0b",
        },
      ],
      fields: ["close", "changePercent"],
      fieldLabels,
      formatPrice,
      formatVolume,
      upColor: "#0f0",
      downColor: "#f00",
    });

    expect(content).toEqual({
      visible: true,
      title: "24 July",
      rows: [
        {
          label: "Close",
          value: "$110.00",
          color: "#eee",
          dimmed: false,
        },
        {
          label: "Change %",
          value: "+10.00%",
          color: "#0f0",
          dimmed: false,
        },
        {
          label: "SMA 20",
          value: "$105.00",
          color: "#f59e0b",
          dimmed: false,
        },
      ],
    });
    expect(formatVolume).toHaveBeenCalledWith(42);
  });

  it("preserves bearish signs, colors, defaults, and missing labels", () => {
    const content = buildStockTooltipContent({
      title: "Candle",
      candle: { t: 1, o: 10, h: 11, l: 7, c: 8, v: 5 },
      indicatorReadings: [],
      fieldLabels: {},
      formatPrice: (value) => value.toFixed(1),
      formatVolume: (value) => value.toFixed(0),
      upColor: "green",
      downColor: "red",
    });

    expect(content.rows.map((row) => row.label)).toEqual(["", "", "", "", "", "", ""]);
    expect(content.rows[4]).toMatchObject({
      value: "-2.0",
      color: "red",
    });
    expect(content.rows[5]).toMatchObject({
      value: "-20.00%",
      color: "red",
    });
  });
});
