import { describe, expect, it } from "vitest";
import {
  aggregateLevel,
  firstAggregationLevelIndex,
  formatAggregationInterval,
  STOCK_AGGREGATION_LEVELS,
} from "./aggregation.js";
import { type AggregatedLevel, StockLevelAccess } from "./levels.js";

const minute = 60_000;

function level(
  timestamp: readonly number[],
  values: {
    open?: readonly number[];
    high?: readonly number[];
    low?: readonly number[];
    close?: readonly number[];
    volume?: readonly number[];
    rawSource?: boolean;
  } = {},
): AggregatedLevel {
  const fallback = timestamp.map((_, index) => index + 1);
  return {
    name: "raw",
    interval: minute / 2,
    timestamp: Float64Array.from(timestamp),
    open: Float64Array.from(values.open ?? fallback),
    high: Float64Array.from(values.high ?? fallback),
    low: Float64Array.from(values.low ?? fallback),
    close: Float64Array.from(values.close ?? fallback),
    volume: Float64Array.from(values.volume ?? fallback),
    length: timestamp.length,
    rawSource: values.rawSource,
  };
}

function access(
  options: {
    marketTime?: boolean;
    logicalToPhysicalIndex?(index: number): number;
    marketX?: readonly number[];
  } = {},
): StockLevelAccess {
  return new StockLevelAccess({
    logicalToPhysicalIndex: options.logicalToPhysicalIndex ?? ((index) => index),
    getRawMarketX: (index) => options.marketX?.[index] ?? index,
    usesMarketTime: () => options.marketTime === true,
  });
}

describe("stock aggregation definitions", () => {
  it("formats source intervals and skips duplicate aggregation levels", () => {
    expect(formatAggregationInterval(1_000)).toBe("1s");
    expect(formatAggregationInterval(minute * 5)).toBe("5m");
    expect(formatAggregationInterval(minute * 60)).toBe("1H");
    expect(formatAggregationInterval(minute * 60 * 24 * 7)).toBe("7D");
    expect(formatAggregationInterval(1_500)).toBe("RAW");
    expect(formatAggregationInterval(Number.NaN)).toBe("RAW");

    expect(firstAggregationLevelIndex(STOCK_AGGREGATION_LEVELS, minute)).toBe(1);
    expect(firstAggregationLevelIndex(STOCK_AGGREGATION_LEVELS, minute * 60 * 24 * 30)).toBe(
      STOCK_AGGREGATION_LEVELS.length,
    );
  });
});

describe("aggregateLevel", () => {
  it("preserves OHLCV semantics and source end timestamps", () => {
    const source = level([0, minute / 2, minute, minute * 1.5], {
      open: [10, Number.NaN, 12, 13],
      high: [12, Number.NaN, 14, 15],
      low: [9, Number.NaN, 11, 12],
      close: [11, Number.NaN, 13, 14],
      volume: [2, 3, 4, Number.NaN],
    });
    const result = aggregateLevel(source, { name: "1m", interval: minute }, access(), false);

    expect(result.length).toBe(2);
    expect(Array.from(result.timestamp)).toEqual([0, minute]);
    expect(Array.from(result.open)).toEqual([10, 12]);
    expect(Array.from(result.high)).toEqual([12, 15]);
    expect(Array.from(result.low)).toEqual([9, 11]);
    expect(Array.from(result.close)).toEqual([11, 14]);
    expect(Array.from(result.volume)).toEqual([2, 4]);
    expect(Array.from(result.sourceEndTimestamp ?? [])).toEqual([0, minute * 1.5]);
    expect(result.marketX).toBeUndefined();
  });

  it("starts a bucket at its first valid candle and records market midpoint X", () => {
    const source = level([0, minute, minute * 1.5], {
      open: [10, Number.NaN, 20],
      high: [11, Number.NaN, 22],
      low: [9, Number.NaN, 19],
      close: [10.5, Number.NaN, 21],
      volume: [1, 2, 3],
      rawSource: true,
    });
    const result = aggregateLevel(
      source,
      { name: "1m", interval: minute },
      access({
        marketTime: true,
        marketX: [0, 10, 30],
      }),
      true,
    );

    expect(result.length).toBe(2);
    expect(Array.from(result.open)).toEqual([10, 20]);
    expect(Array.from(result.marketX ?? [])).toEqual([0, 20]);
  });

  it("reads wrapped raw storage through logical indices", () => {
    const source = level([minute * 2, minute * 3, 0, minute], {
      open: [30, 40, 10, 20],
      high: [31, 41, 11, 21],
      low: [29, 39, 9, 19],
      close: [30.5, 40.5, 10.5, 20.5],
      volume: [3, 4, 1, 2],
      rawSource: true,
    });
    const result = aggregateLevel(
      source,
      { name: "2m", interval: minute * 2 },
      access({
        logicalToPhysicalIndex: (index) => (index + 2) % 4,
      }),
      false,
    );

    expect(Array.from(result.timestamp)).toEqual([0, minute * 2]);
    expect(Array.from(result.open)).toEqual([10, 30]);
    expect(Array.from(result.close)).toEqual([20.5, 40.5]);
    expect(Array.from(result.volume)).toEqual([3, 7]);
  });

  it("grows bounded output for unsorted input without trusting endpoints", () => {
    const source = level([0, minute * 5, minute * 10, minute]);
    const result = aggregateLevel(source, { name: "1m", interval: minute }, access(), false);

    expect(result.length).toBe(4);
    expect(Array.from(result.timestamp)).toEqual([0, minute * 5, minute * 10, minute]);
  });

  it("returns an empty level when no candle is valid", () => {
    const invalid = [Number.NaN, Number.NaN];
    const result = aggregateLevel(
      level([0, minute], {
        open: invalid,
        high: invalid,
        low: invalid,
        close: invalid,
      }),
      { name: "1m", interval: minute },
      access(),
      false,
    );

    expect(result).toMatchObject({
      name: "1m",
      interval: minute,
      length: 0,
    });
    expect(result.timestamp).toHaveLength(0);
  });
});
