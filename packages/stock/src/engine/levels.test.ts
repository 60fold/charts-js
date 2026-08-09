import { describe, expect, it } from "vitest";
import { StockLevelAccess, type AggregatedLevel } from "./levels.js";

function level(
  timestamp: readonly number[],
  options: Partial<AggregatedLevel> = {},
): AggregatedLevel {
  const values = Float64Array.from(timestamp);
  return {
    name: "test",
    interval: 1,
    timestamp: values,
    open: Float64Array.from(timestamp, (value) => value + 10),
    high: Float64Array.from(timestamp, (value) => value + 20),
    low: Float64Array.from(timestamp, (value) => value + 30),
    close: Float64Array.from(timestamp, (value) => value + 40),
    volume: Float64Array.from(timestamp, (value) => value + 50),
    length: timestamp.length,
    ...options,
  };
}

describe("StockLevelAccess", () => {
  it("reads raw ring-buffer columns through logical indices", () => {
    const access = new StockLevelAccess({
      logicalToPhysicalIndex: (index) => (index + 2) % 4,
      getRawMarketX: (index) => 100 + index,
      usesMarketTime: () => false,
    });
    const raw = level([10, 20, 30, 40], { rawSource: true });

    expect(access.arrayIndex(raw, 0)).toBe(2);
    expect(access.getTimestamp(raw, 0)).toBe(30);
    expect(access.getOpen(raw, 0)).toBe(40);
    expect(access.getHigh(raw, 0)).toBe(50);
    expect(access.getLow(raw, 0)).toBe(60);
    expect(access.getClose(raw, 0)).toBe(70);
    expect(access.getVolume(raw, 0)).toBe(80);
    expect(access.getSourceEndTimestamp(raw, 0)).toBe(30);
  });

  it("uses compressed market coordinates without remapping aggregated data", () => {
    let marketTime = true;
    const access = new StockLevelAccess({
      logicalToPhysicalIndex: (index) => index,
      getRawMarketX: (index) => 500 + index * 2,
      usesMarketTime: () => marketTime,
    });
    const raw = level([10, 20, 30], { rawSource: true });
    const aggregated = level([10, 20, 30], {
      marketX: new Float64Array([5, 9, 12]),
      sourceEndTimestamp: new Float64Array([19, 29, 39]),
    });

    expect(access.getX(raw, 1)).toBe(502);
    expect(access.getX(aggregated, 1)).toBe(9);
    expect(access.getSourceEndTimestamp(aggregated, 1)).toBe(29);
    delete aggregated.marketX;
    expect(access.getX(aggregated, 1)).toBe(20);
    marketTime = false;
    expect(access.getX(raw, 1)).toBe(20);
  });

  it("finds left and right X boundaries with duplicate values", () => {
    const access = new StockLevelAccess({
      logicalToPhysicalIndex: (index) => index,
      getRawMarketX: (index) => index,
      usesMarketTime: () => false,
    });
    const data = level([10, 20, 20, 30, 40]);

    expect(access.binarySearchLeft(data, 20)).toBe(1);
    expect(access.binarySearchRight(data, 20)).toBe(2);
    expect(access.binarySearchLeft(data, 25, 2, 4)).toBe(3);
    expect(access.binarySearchRight(data, 35, 1, 4)).toBe(3);
  });

  it("searches source timestamps independently of market X", () => {
    const access = new StockLevelAccess({
      logicalToPhysicalIndex: (index) => index,
      getRawMarketX: (index) => index,
      usesMarketTime: () => true,
    });
    const data = level([100, 200, 300, 400], {
      marketX: new Float64Array([0, 1, 2, 3]),
    });

    expect(access.binarySearchTimestampLeft(data, 250)).toBe(2);
    expect(access.binarySearchTimestampLeft(data, 50)).toBe(0);
    expect(access.binarySearchTimestampLeft(data, 450)).toBe(3);
    expect(access.binarySearchTimestampLeft(data, 250, 1, 2)).toBe(2);
  });
});
