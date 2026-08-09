import { describe, expect, it } from "vitest";
import type { OHLCVData } from "./ohlcv";
import {
  calculateBollingerBands,
  calculateEMA,
  calculateSMA,
  calculateVWAP,
  computeStockIndicator,
  type StockIndicator,
  type StockPriceSource,
} from "./analytics";

function makeData(
  timestamps: number[],
  options: Partial<{
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume: number[];
  }> = {},
): OHLCVData {
  const length = timestamps.length;
  const close = options.close ?? timestamps.map((_, index) => index + 1);
  return {
    timestamp: new Float64Array(timestamps),
    open: new Float64Array(options.open ?? close),
    high: new Float64Array(options.high ?? close),
    low: new Float64Array(options.low ?? close),
    close: new Float64Array(close),
    volume: new Float64Array(options.volume ?? timestamps.map(() => 1)),
    length,
  };
}

function expectValues(actual: Float64Array, expected: number[], precision = 10): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (Number.isNaN(expected[i])) expect(actual[i]).toBeNaN();
    else expect(actual[i]).toBeCloseTo(expected[i], precision);
  }
}

describe("moving averages", () => {
  it("calculates SMA and EMA with the expected warmup", () => {
    const values = new Float64Array([1, 2, 3, 5, 5]);

    expectValues(calculateSMA(values, 3), [NaN, NaN, 2, 10 / 3, 13 / 3]);
    expectValues(calculateEMA(values, 3), [NaN, NaN, 2, 3.5, 4.25]);
  });

  it("requires a new contiguous warmup after NaN values", () => {
    const values = new Float64Array([1, 2, NaN, 4, 5, 6, 7]);

    expectValues(calculateSMA(values, 3), [NaN, NaN, NaN, NaN, NaN, 5, 6]);
    expectValues(calculateEMA(values, 3), [NaN, NaN, NaN, NaN, NaN, 5, 6]);
  });
});

describe("Bollinger Bands", () => {
  it("calculates population-standard-deviation bands", () => {
    const values = new Float64Array([1, 2, 3, 4]);
    const bands = calculateBollingerBands(values, 3, 2);
    const width = Math.sqrt(2 / 3) * 2;

    expectValues(bands.middle, [NaN, NaN, 2, 3]);
    expectValues(bands.upper, [NaN, NaN, 2 + width, 3 + width]);
    expectValues(bands.lower, [NaN, NaN, 2 - width, 3 - width]);
  });

  it("does not bridge a band across a non-finite input", () => {
    const bands = calculateBollingerBands(new Float64Array([1, 2, NaN, 4, 5, 6]), 3);

    expectValues(bands.middle, [NaN, NaN, NaN, NaN, NaN, 5]);
  });

  it("retains low variance around a large offset", () => {
    const values = new Float64Array([
      1_000_000_000.01, 999_999_999.99, 1_000_000_000.02, 999_999_999.98, 1_000_000_000.015,
    ]);
    const period = 4;
    const bands = calculateBollingerBands(values, period);

    for (let index = period - 1; index < values.length; index++) {
      const window = values.subarray(index - period + 1, index + 1);
      const origin = window[0];
      let offsetMean = 0;
      for (const value of window) offsetMean += value - origin;
      offsetMean /= period;
      let variance = 0;
      for (const value of window) {
        variance += (value - origin - offsetMean) ** 2;
      }
      variance /= period;
      const expectedWidth = 4 * Math.sqrt(variance);

      expect(bands.upper[index] - bands.lower[index]).toBeCloseTo(expectedWidth, 6);
      expect(bands.upper[index]).toBeGreaterThan(bands.middle[index]);
      expect(bands.lower[index]).toBeLessThan(bands.middle[index]);
    }
  });

  it("recovers after an extreme value leaves the rolling window", () => {
    const period = 4;
    const values = new Float64Array([
      100, 100.25, 99.75, 1_000_000_000_000, 100.5, 99.5, 100.25, 99.75,
    ]);
    const bands = calculateBollingerBands(values, period);

    const expectedWindow = [100.5, 99.5, 100.25, 99.75];
    const expectedMean = expectedWindow.reduce((sum, value) => sum + value, 0) / period;
    const expectedVariance =
      expectedWindow.reduce((sum, value) => sum + (value - expectedMean) ** 2, 0) / period;
    const last = values.length - 1;

    expect(bands.middle[last]).toBeCloseTo(expectedMean, 12);
    expect(bands.upper[last] - bands.lower[last]).toBeCloseTo(4 * Math.sqrt(expectedVariance), 10);
  });

  it("rebases extreme cancellation for sub-unit data", () => {
    const period = 4;
    const scale = 1e-12;
    const values = Float64Array.from(
      [100, 100.25, 99.75, 1_000_000_000_000, 100.5, 99.5, 100.25, 99.75],
      (value) => value * scale,
    );
    const bands = calculateBollingerBands(values, period);
    const expectedWindow = Array.from(values.slice(-period));
    const expectedMean = expectedWindow.reduce((sum, value) => sum + value, 0) / period;
    const expectedVariance =
      expectedWindow.reduce((sum, value) => sum + (value - expectedMean) ** 2, 0) / period;
    const expectedWidth = 4 * Math.sqrt(expectedVariance);
    const last = values.length - 1;

    expect((bands.upper[last] - bands.lower[last]) / expectedWidth).toBeCloseTo(1, 8);
  });
});

describe("VWAP", () => {
  it("calculates typical-price VWAP", () => {
    const data = makeData([1, 2, 3], {
      open: [8, 18, 28],
      high: [12, 22, 32],
      low: [8, 18, 28],
      close: [10, 20, 30],
      volume: [1, 2, 1],
    });

    expectValues(calculateVWAP(data, { reset: "none" }), [10, 50 / 3, 20]);
  });

  it("uses UTC day boundaries and honors a reset offset", () => {
    const data = makeData(
      [Date.UTC(2024, 0, 1, 23), Date.UTC(2024, 0, 2, 0), Date.UTC(2024, 0, 2, 1)],
      { close: [10, 20, 30] },
    );

    expectValues(calculateVWAP(data, { source: "close", reset: "day" }), [10, 20, 25]);
    expectValues(
      calculateVWAP(data, {
        source: "close",
        reset: "day",
        resetOffsetMs: 60 * 60 * 1000,
      }),
      [10, 15, 30],
    );
  });

  it("starts a new UTC week on Monday", () => {
    const data = makeData(
      [
        Date.UTC(2024, 0, 7, 23), // Sunday
        Date.UTC(2024, 0, 8, 0), // Monday
        Date.UTC(2024, 0, 8, 1),
      ],
      { close: [10, 20, 30] },
    );

    expectValues(calculateVWAP(data, { source: "close", reset: "week" }), [10, 20, 25]);
  });

  it("restarts contiguous accumulation after invalid data", () => {
    const data = makeData([1, 2, 3, 4], {
      close: [10, NaN, 30, 40],
      volume: [1, 1, 1, 1],
    });

    expectValues(calculateVWAP(data, { source: "close", reset: "none" }), [10, NaN, 30, 35]);
  });
});

describe("computeStockIndicator", () => {
  it.each<[StockPriceSource, number]>([
    ["open", 8],
    ["high", 12],
    ["low", 4],
    ["close", 10],
    ["hl2", 8],
    ["hlc3", 26 / 3],
    ["ohlc4", 8.5],
  ])("supports the %s price source", (source, expected) => {
    const data = makeData([1], {
      open: [8],
      high: [12],
      low: [4],
      close: [10],
    });
    const computed = computeStockIndicator(data, {
      type: "sma",
      period: 1,
      source,
    });

    expect(computed.type).toBe("sma");
    expect(computed.lines[0].name).toBe("sma");
    expect(computed.lines[0].values[0]).toBeCloseTo(expected, 10);
  });

  it("returns named Bollinger Band lines", () => {
    const computed = computeStockIndicator(makeData([1, 2, 3]), {
      type: "bollinger",
      period: 2,
    });

    expect(computed.type).toBe("bollinger");
    expect(computed.lines.map((line) => line.name)).toEqual(["middle", "upper", "lower"]);
    expect(computed.lines.every((line) => line.values instanceof Float64Array)).toBe(true);
  });

  it("ignores renderer styling fields during calculation", () => {
    const data = makeData([1, 2, 3, 4]);
    const plain = computeStockIndicator(data, { type: "ema", period: 2 });
    const styled = computeStockIndicator(data, {
      type: "ema",
      period: 2,
      id: "fast-ema",
      label: "Fast EMA",
      visible: false,
      color: "#ff00aa",
      lineWidth: 4,
      lineDash: "dashed",
      includeInScale: false,
    });

    expect(styled.lines[0].values).toEqual(plain.lines[0].values);
  });
});

describe("analytics validation and purity", () => {
  it("rejects invalid periods, deviations, and VWAP options", () => {
    const values = new Float64Array([1, 2, 3]);
    const data = makeData([1, 2, 3]);

    expect(() => calculateSMA(values, 0)).toThrow(RangeError);
    expect(() => calculateEMA(values, 1.5)).toThrow("Indicator period must be a positive integer");
    expect(() => calculateBollingerBands(values, 2, -1)).toThrow(
      "Bollinger Bands deviation must be a finite non-negative number",
    );
    expect(() => calculateBollingerBands(values, 2, Infinity)).toThrow(RangeError);
    expect(() => calculateVWAP(data, { reset: "session" as "day" })).toThrow(
      "Unsupported VWAP reset",
    );
    expect(() => calculateVWAP(data, { resetOffsetMs: NaN })).toThrow(
      "VWAP resetOffsetMs must be finite",
    );
    expect(() => computeStockIndicator(data, { type: "rsi" } as unknown as StockIndicator)).toThrow(
      "Unsupported stock indicator type",
    );
  });

  it("rejects misaligned OHLCV inputs", () => {
    const data = makeData([1, 2]);
    data.volume = new Float64Array([1]);

    expect(() => calculateVWAP(data)).toThrow("OHLCV columns must all have the same length");
  });

  it("does not mutate source values, OHLCV columns, or config", () => {
    const values = new Float64Array([1, 2, 3, 4]);
    const valuesBefore = values.slice();
    const data = makeData([1, 2, 3, 4], {
      open: [1, 2, 3, 4],
      high: [3, 4, 5, 6],
      low: [0, 1, 2, 3],
      close: [2, 3, 4, 5],
      volume: [10, 20, 30, 40],
    });
    const before = {
      timestamp: data.timestamp.slice(),
      open: data.open.slice(),
      high: data.high.slice(),
      low: data.low.slice(),
      close: data.close.slice(),
      volume: data.volume.slice(),
    };
    const config: StockIndicator = {
      type: "bollinger",
      period: 2,
      deviation: 1.5,
      source: "ohlc4",
      id: "bands",
      middleColor: "#ffffff",
      upperColor: "#00ff00",
      lowerColor: "#ff0000",
      fillColor: "#999999",
      fillOpacity: 0.2,
    };
    const configBefore = { ...config };

    calculateSMA(values, 2);
    calculateEMA(values, 2);
    calculateBollingerBands(values, 2);
    calculateVWAP(data, { source: "ohlc4", reset: "none" });
    computeStockIndicator(data, config);

    expect(values).toEqual(valuesBefore);
    expect(data.timestamp).toEqual(before.timestamp);
    expect(data.open).toEqual(before.open);
    expect(data.high).toEqual(before.high);
    expect(data.low).toEqual(before.low);
    expect(data.close).toEqual(before.close);
    expect(data.volume).toEqual(before.volume);
    expect(config).toEqual(configBefore);
  });
});
