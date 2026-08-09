import { describe, expect, it } from "vitest";
import { computeStockIndicator, type StockIndicator, type StockPriceSource } from "../analytics.js";
import type { OHLCVData } from "../ohlcv.js";
import {
  StockIndicatorRuntime,
  getIndicatorLine,
  getIndicatorLineColor,
  getIndicatorLineDash,
  getSourceFromCandle,
  indicatorCalculationKey,
  type IndicatorDataSource,
  type RawCandleValues,
} from "./indicatorRuntime.js";

function makeData(values: readonly number[]): OHLCVData {
  const length = values.length;
  return {
    timestamp: Float64Array.from(values, (_, index) => Date.UTC(2026, 0, 1, 0, index)),
    open: Float64Array.from(values, (value) => value - 0.5),
    high: Float64Array.from(values, (value) => value + 1),
    low: Float64Array.from(values, (value) => value - 1),
    close: Float64Array.from(values),
    volume: Float64Array.from(values, (_, index) => index + 1),
    length,
  };
}

function sourceValue(data: OHLCVData, source: StockPriceSource | undefined, index: number): number {
  return getSourceFromCandle(source, {
    timestamp: data.timestamp[index],
    open: data.open[index],
    high: data.high[index],
    low: data.low[index],
    close: data.close[index],
    volume: data.volume[index],
  });
}

function expectValues(actual: Float64Array, expected: Float64Array | readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  for (let index = 0; index < expected.length; index++) {
    if (Number.isNaN(expected[index])) {
      expect(actual[index]).toBeNaN();
    } else {
      expect(actual[index]).toBeCloseTo(expected[index], 10);
    }
  }
}

function createStaticRuntime(data: OHLCVData | null): {
  runtime: StockIndicatorRuntime;
  changes: { count: number };
} {
  const changes = { count: 0 };
  const source: IndicatorDataSource = {
    getStaticData: () => data,
    isRingBuffer: () => false,
    getDataLength: () => data?.length ?? 0,
    getRingCapacity: () => data?.length ?? 0,
    getWriteIndex: () => data?.length ?? 0,
    logicalToPhysicalIndex: (index) => index,
    getSourceAtPhysical: (priceSource, index) => sourceValue(data!, priceSource, index),
    getTimestampAtPhysical: (index) => data!.timestamp[index],
    getVolumeAtPhysical: (index) => data!.volume[index],
    onChange: () => {
      changes.count++;
    },
  };
  return {
    runtime: new StockIndicatorRuntime(source),
    changes,
  };
}

interface RingFixture {
  runtime: StockIndicatorRuntime;
  append(candle: RawCandleValues): void;
  rebase(): void;
  data: OHLCVData;
  state: {
    length: number;
    writeIndex: number;
    full: boolean;
    changes: number;
  };
}

function createRingRuntime(capacity: number): RingFixture {
  const data: OHLCVData = {
    timestamp: new Float64Array(capacity),
    open: new Float64Array(capacity),
    high: new Float64Array(capacity),
    low: new Float64Array(capacity),
    close: new Float64Array(capacity),
    volume: new Float64Array(capacity),
    length: capacity,
  };
  const state = {
    length: 0,
    writeIndex: 0,
    full: false,
    changes: 0,
  };
  const source: IndicatorDataSource = {
    getStaticData: () => null,
    isRingBuffer: () => true,
    getDataLength: () => state.length,
    getRingCapacity: () => capacity,
    getWriteIndex: () => state.writeIndex,
    logicalToPhysicalIndex: (index) => (state.full ? (state.writeIndex + index) % capacity : index),
    getSourceAtPhysical: (priceSource, index) => sourceValue(data, priceSource, index),
    getTimestampAtPhysical: (index) => data.timestamp[index],
    getVolumeAtPhysical: (index) => data.volume[index],
    onChange: () => {
      state.changes++;
    },
  };
  const runtime = new StockIndicatorRuntime(source);

  return {
    runtime,
    data,
    state,
    append(candle) {
      const physicalIndex = state.writeIndex;
      const overwritten = state.full
        ? {
            timestamp: data.timestamp[physicalIndex],
            open: data.open[physicalIndex],
            high: data.high[physicalIndex],
            low: data.low[physicalIndex],
            close: data.close[physicalIndex],
            volume: data.volume[physicalIndex],
          }
        : null;
      data.timestamp[physicalIndex] = candle.timestamp;
      data.open[physicalIndex] = candle.open;
      data.high[physicalIndex] = candle.high;
      data.low[physicalIndex] = candle.low;
      data.close[physicalIndex] = candle.close;
      data.volume[physicalIndex] = candle.volume;
      runtime.append(physicalIndex, overwritten);
      state.writeIndex = (state.writeIndex + 1) % capacity;
      if (state.writeIndex === 0) state.full = true;
      state.length = state.full ? capacity : state.writeIndex;
    },
    rebase() {
      const latest = (state.writeIndex - 1 + capacity) % capacity;
      runtime.rebaseRollingStates(latest);
    },
  };
}

function candle(
  close: number,
  timestamp = Date.UTC(2026, 0, 1, 0, close),
  volume = close,
): RawCandleValues {
  return {
    timestamp,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume,
  };
}

describe("StockIndicatorRuntime static calculations", () => {
  it("matches the public analytics calculations for every indicator type", () => {
    const data = makeData([10, 11, 12, 13, 14, 15]);
    const definitions: StockIndicator[] = [
      { type: "sma", period: 3, source: "hl2" },
      { type: "ema", period: 3 },
      { type: "bollinger", period: 3, deviation: 1.5 },
      { type: "vwap", reset: "none" },
    ];
    const { runtime, changes } = createStaticRuntime(data);

    runtime.setDefinitions(definitions);

    expect(runtime.items).toHaveLength(definitions.length);
    for (let index = 0; index < definitions.length; index++) {
      const expected = computeStockIndicator(data, definitions[index]);
      expect(runtime.items[index].computed.type).toBe(expected.type);
      for (let lineIndex = 0; lineIndex < expected.lines.length; lineIndex++) {
        expect(runtime.items[index].computed.lines[lineIndex].name).toBe(
          expected.lines[lineIndex].name,
        );
        expectValues(
          runtime.items[index].computed.lines[lineIndex].values,
          expected.lines[lineIndex].values,
        );
      }
    }
    expect(changes.count).toBe(1);
  });

  it("reuses compatible calculations when only renderer styling changes", () => {
    const data = makeData([1, 2, 3, 4]);
    const { runtime } = createStaticRuntime(data);
    runtime.setDefinitions([{ id: "average", type: "sma", period: 2, color: "#f00" }]);
    const previous = runtime.items[0];

    runtime.setDefinitions([
      {
        id: "average",
        type: "sma",
        period: 2,
        color: "#0f0",
        lineWidth: 3,
      },
    ]);

    expect(runtime.items[0]).toBe(previous);
    expect(runtime.items[0].definition.color).toBe("#0f0");
    runtime.setDefinitions([{ id: "average", type: "sma", period: 3, color: "#0f0" }]);
    expect(runtime.items[0]).not.toBe(previous);
  });

  it("clears calculations while static data is unavailable", () => {
    const { runtime, changes } = createStaticRuntime(null);
    runtime.setDefinitions([{ type: "sma", period: 2 }]);

    expect(runtime.items).toEqual([]);
    expect(changes.count).toBe(0);
  });
});

describe("StockIndicatorRuntime streaming calculations", () => {
  it("updates SMA, EMA, Bollinger Bands, and daily VWAP incrementally", () => {
    const fixture = createRingRuntime(8);
    fixture.runtime.setDefinitions([
      { type: "sma", period: 3 },
      { type: "ema", period: 3 },
      { type: "bollinger", period: 3 },
      { type: "vwap", source: "close", reset: "day" },
    ]);
    const firstDay = Date.UTC(2026, 0, 1, 23, 58);
    fixture.append(candle(1, firstDay));
    fixture.append(candle(2, firstDay + 60_000));
    fixture.append(candle(3, firstDay + 120_000));
    fixture.append(candle(4, firstDay + 180_000));

    expectValues(getIndicatorLine(fixture.runtime.items[0], "sma")!.subarray(0, 4), [
      NaN,
      NaN,
      2,
      3,
    ]);
    expectValues(getIndicatorLine(fixture.runtime.items[1], "ema")!.subarray(0, 4), [
      NaN,
      NaN,
      2,
      3,
    ]);
    expectValues(getIndicatorLine(fixture.runtime.items[2], "middle")!.subarray(0, 4), [
      NaN,
      NaN,
      2,
      3,
    ]);
    expectValues(getIndicatorLine(fixture.runtime.items[3], "vwap")!.subarray(0, 4), [
      1,
      5 / 3,
      3,
      25 / 7,
    ]);
  });

  it("uses overwritten ring values and can rebase rolling state", () => {
    const fixture = createRingRuntime(4);
    fixture.runtime.setDefinitions([
      { type: "sma", period: 4 },
      { type: "bollinger", period: 3 },
    ]);
    for (let value = 1; value <= 5; value++) {
      fixture.append(candle(value));
    }

    expect(getIndicatorLine(fixture.runtime.items[0], "sma")![0]).toBe(3.5);
    fixture.runtime.items[0].rollingMean = 999;
    fixture.runtime.items[1].rollingM2 = 999;
    fixture.rebase();
    expect(getIndicatorLine(fixture.runtime.items[0], "sma")![0]).toBe(3.5);
    expect(getIndicatorLine(fixture.runtime.items[1], "middle")![0]).toBe(4);
  });

  it("retains low Bollinger variance while a high-offset ring wraps", () => {
    const fixture = createRingRuntime(8);
    const period = 5;
    fixture.runtime.setDefinitions([{ type: "bollinger", period }]);

    for (let index = 0; index < 24; index++) {
      const value = 1_000_000_000 + Math.sin(index * 0.37) * 0.01;
      fixture.append(candle(value, Date.UTC(2026, 0, 1, 0, index), 1));
      if (index < period - 1) continue;

      const latest = (fixture.state.writeIndex - 1 + fixture.data.length) % fixture.data.length;
      const middle = getIndicatorLine(fixture.runtime.items[0], "middle")![latest];
      const upper = getIndicatorLine(fixture.runtime.items[0], "upper")![latest];
      const lower = getIndicatorLine(fixture.runtime.items[0], "lower")![latest];

      expect(middle).toBeGreaterThan(999_999_999);
      expect(upper - lower).toBeGreaterThan(0);
      expect(upper - lower).toBeLessThan(0.1);
    }
  });

  it("recovers Bollinger variance after an extreme value leaves the window", () => {
    const fixture = createRingRuntime(12);
    const period = 4;
    fixture.runtime.setDefinitions([{ type: "bollinger", period }]);
    const values = [100, 100.25, 99.75, 1_000_000_000_000, 100.5, 99.5, 100.25, 99.75];

    values.forEach((value, index) => {
      fixture.append(candle(value, Date.UTC(2026, 0, 1, 0, index), 1));
    });

    const latest = values.length - 1;
    const expectedWindow = values.slice(-period);
    const expectedMean = expectedWindow.reduce((sum, value) => sum + value, 0) / period;
    const expectedVariance =
      expectedWindow.reduce((sum, value) => sum + (value - expectedMean) ** 2, 0) / period;
    const middle = getIndicatorLine(fixture.runtime.items[0], "middle")![latest];
    const upper = getIndicatorLine(fixture.runtime.items[0], "upper")![latest];
    const lower = getIndicatorLine(fixture.runtime.items[0], "lower")![latest];

    expect(middle).toBeCloseTo(expectedMean, 12);
    expect(upper - lower).toBeCloseTo(4 * Math.sqrt(expectedVariance), 10);
  });

  it("rebases sub-unit Bollinger variance after an extreme value leaves the window", () => {
    const fixture = createRingRuntime(12);
    const period = 4;
    const scale = 1e-12;
    fixture.runtime.setDefinitions([{ type: "bollinger", period }]);
    const values = [100, 100.25, 99.75, 1_000_000_000_000, 100.5, 99.5, 100.25, 99.75].map(
      (value) => value * scale,
    );

    values.forEach((value, index) => {
      fixture.append(candle(value, Date.UTC(2026, 0, 1, 0, index), 1));
    });

    const expectedWindow = values.slice(-period);
    const expectedMean = expectedWindow.reduce((sum, value) => sum + value, 0) / period;
    const expectedVariance =
      expectedWindow.reduce((sum, value) => sum + (value - expectedMean) ** 2, 0) / period;
    const expectedWidth = 4 * Math.sqrt(expectedVariance);
    const latest = values.length - 1;
    const upper = getIndicatorLine(fixture.runtime.items[0], "upper")![latest];
    const lower = getIndicatorLine(fixture.runtime.items[0], "lower")![latest];

    expect((upper - lower) / expectedWidth).toBeCloseTo(1, 8);
  });

  it("resets contiguous EMA and VWAP accumulation after invalid samples", () => {
    const fixture = createRingRuntime(8);
    fixture.runtime.setDefinitions([
      { type: "ema", period: 2 },
      { type: "vwap", source: "close", reset: "none" },
    ]);
    fixture.append(candle(1));
    fixture.append(candle(2));
    fixture.append(candle(Number.NaN, Date.UTC(2026, 0, 1, 0, 3)));
    fixture.append(candle(4));
    fixture.append(candle(5));

    expectValues(getIndicatorLine(fixture.runtime.items[0], "ema")!.subarray(0, 5), [
      NaN,
      1.5,
      NaN,
      NaN,
      4.5,
    ]);
    expectValues(getIndicatorLine(fixture.runtime.items[1], "vwap")!.subarray(0, 5), [
      1,
      5 / 3,
      NaN,
      4,
      41 / 9,
    ]);
  });

  for (const [label, invalidVolume] of [
    ["non-finite", Number.NaN],
    ["negative", -1],
  ] as const) {
    it(`resets VWAP accumulation after a ${label}-volume sample`, () => {
      const fixture = createRingRuntime(8);
      fixture.runtime.setDefinitions([{ type: "vwap", source: "close", reset: "none" }]);
      fixture.append(candle(1));
      fixture.append(candle(2));
      fixture.append(candle(3, Date.UTC(2026, 0, 1, 0, 3), invalidVolume));
      fixture.append(candle(4));
      fixture.append(candle(5));

      expectValues(getIndicatorLine(fixture.runtime.items[0], "vwap")!.subarray(0, 5), [
        1,
        5 / 3,
        NaN,
        4,
        41 / 9,
      ]);
    });
  }
});

describe("indicator runtime helpers", () => {
  it("resolves line colors and dash styles from indicator appearance", () => {
    expect(
      getIndicatorLineColor(
        {
          type: "bollinger",
          period: 20,
          upperColor: "#upper",
          color: "#fallback",
        },
        "upper",
      ),
    ).toBe("#upper");
    expect(
      getIndicatorLineColor({ type: "bollinger", period: 20, color: "#fallback" }, "lower"),
    ).toBe("#fallback");
    expect(getIndicatorLineColor({ type: "bollinger", period: 20 }, "middle")).toBe("#fbbf24");
    expect(getIndicatorLineColor({ type: "sma", period: 20 }, "sma")).toBe("#f59e0b");
    expect(getIndicatorLineColor({ type: "ema", period: 20 }, "ema")).toBe("#38bdf8");
    expect(getIndicatorLineColor({ type: "vwap" }, "vwap")).toBe("#a78bfa");
    expect(
      getIndicatorLineDash({
        type: "sma",
        period: 20,
        lineDash: "dashed",
      }),
    ).toEqual([6, 4]);
    expect(
      getIndicatorLineDash({
        type: "sma",
        period: 20,
        lineDash: "dotted",
      }),
    ).toEqual([2, 3]);
    expect(getIndicatorLineDash({ type: "sma", period: 20 })).toEqual([]);
  });

  it("resolves every derived price source without allocating chart state", () => {
    const input = candle(10);
    expect(
      ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"].map((source) =>
        getSourceFromCandle(source as StockPriceSource, input),
      ),
    ).toEqual([9.5, 11, 9, 10, 10, 10, 9.875]);
  });

  it("keys calculation inputs but ignores presentation-only fields", () => {
    expect(
      indicatorCalculationKey(
        {
          id: "band",
          type: "bollinger",
          period: 20,
          source: "hl2",
          deviation: 3,
          color: "#f00",
        },
        4,
      ),
    ).toBe("id:band|bollinger|20|hl2|3");
    expect(
      indicatorCalculationKey(
        {
          type: "vwap",
          reset: "week",
          resetOffsetMs: 3_600_000,
        },
        2,
      ),
    ).toBe("index:2|vwap|hlc3|week|3600000");
  });
});
