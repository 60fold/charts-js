import { describe, expect, it } from "vitest";
import {
  buildMarketCoordinates,
  collectMarketDayStarts,
  getContinuousRangeStart,
  getMarketRangeStart,
  getSessionStartIndex,
  inferMinimumInterval,
  marketXToTimestamp,
  nextMinimumInterval,
  timestampToMarketX,
} from "./marketTime.js";

const minute = 60_000;
const day = 24 * 60 * minute;

describe("market-time cadence", () => {
  it("infers the smallest finite positive source interval", () => {
    const values = [0, minute, minute, 4 * minute, 4.5 * minute];
    expect(inferMinimumInterval(values.length, (index) => values[index])).toBe(minute / 2);
    expect(inferMinimumInterval(1, () => 0)).toBeNull();
    expect(inferMinimumInterval(3, () => Number.NaN)).toBeNull();
  });

  it("updates a streaming minimum only for valid positive differences", () => {
    expect(nextMinimumInterval(minute, false, 0, 5 * minute)).toEqual({
      interval: 5 * minute,
      known: true,
    });
    expect(nextMinimumInterval(minute, true, 0, minute / 2)).toEqual({
      interval: minute / 2,
      known: true,
    });
    expect(nextMinimumInterval(minute, true, minute, minute)).toEqual({
      interval: minute,
      known: true,
    });
  });
});

describe("market-time coordinates", () => {
  it("caps closures while retaining observed intra-session spacing", () => {
    const timestamps = [
      Date.UTC(2026, 0, 1, 23, 58),
      Date.UTC(2026, 0, 1, 23, 59),
      Date.UTC(2026, 0, 2, 8, 0),
      Date.UTC(2026, 0, 2, 8, 1),
    ];
    const existing = new Float64Array(8);
    const result = buildMarketCoordinates({
      length: timestamps.length,
      capacity: 8,
      rawInterval: minute,
      gapCap: minute,
      existing,
      logicalToPhysicalIndex: (index) => (index + 2) % 8,
      getTimestamp: (index) => timestamps[index],
    });

    expect(result.coordinates).toBe(existing);
    expect(Array.from(result.coordinates.slice(2, 6))).toEqual([0, minute, 2 * minute, 3 * minute]);
    expect(result.dayStarts).toEqual([0, 2]);
  });

  it("uses the raw cadence for non-positive or invalid gaps", () => {
    const timestamps = [100, 90, Number.NaN];
    const result = buildMarketCoordinates({
      length: timestamps.length,
      capacity: 3,
      rawInterval: 10,
      gapCap: 10,
      existing: null,
      logicalToPhysicalIndex: (index) => index,
      getTimestamp: (index) => timestamps[index],
    });

    expect(Array.from(result.coordinates)).toEqual([0, 10, 20]);
    expect(
      buildMarketCoordinates({
        length: 0,
        capacity: 2,
        rawInterval: 10,
        gapCap: 10,
        existing: null,
        logicalToPhysicalIndex: (index) => index,
        getTimestamp: () => 0,
      }).dayStarts,
    ).toEqual([]);
  });

  it("interpolates timestamps and compressed coordinates in both directions", () => {
    const timestamps = [0, 10, 110];
    const coordinates = [0, 10, 20];
    const getTimestamp = (index: number) => timestamps[index];
    const getMarketX = (index: number) => coordinates[index];

    expect(timestampToMarketX(60, 3, getTimestamp, getMarketX)).toBe(15);
    expect(marketXToTimestamp(15, 3, getTimestamp, getMarketX)).toBe(60);
    expect(timestampToMarketX(-10, 3, getTimestamp, getMarketX)).toBe(0);
    expect(marketXToTimestamp(-10, 3, getTimestamp, getMarketX)).toBe(0);
    expect(timestampToMarketX(10, 0, getTimestamp, getMarketX)).toBe(10);
    expect(marketXToTimestamp(10, 0, getTimestamp, getMarketX)).toBe(10);
  });

  it("uses the current endpoint for degenerate source intervals", () => {
    const timestamps = [10, 10];
    const coordinates = [0, 0];
    expect(
      timestampToMarketX(
        10,
        2,
        (index) => timestamps[index],
        (index) => coordinates[index],
      ),
    ).toBe(0);
    expect(
      marketXToTimestamp(
        0,
        2,
        (index) => timestamps[index],
        (index) => coordinates[index],
      ),
    ).toBe(10);
  });
});

describe("market sessions", () => {
  it("collects UTC day starts", () => {
    const timestamps = [0, minute, day, day + minute, 2 * day];
    const starts = collectMarketDayStarts(timestamps.length, (index) => timestamps[index]);
    expect(starts).toEqual([0, 2, 4]);
    expect(getSessionStartIndex(starts, 2)).toBe(2);
    expect(getSessionStartIndex(starts, 20)).toBe(0);
    expect(getSessionStartIndex([], 1)).toBe(0);
  });

  it("resolves continuous presets without exceeding the data start", () => {
    const now = new Date(2026, 6, 24, 12).getTime();
    expect(getContinuousRangeStart("1D", now, 10)).toBe(now - day);
    expect(getContinuousRangeStart("6M", now, 10)).toBe(now - 180 * day);
    expect(getContinuousRangeStart("YTD", now, 10)).toBe(new Date(2026, 0, 1).getTime());
    expect(getContinuousRangeStart("ALL", now, 10)).toBe(10);
    expect(getContinuousRangeStart("unknown", now, 10)).toBe(10);
  });

  it("resolves session and UTC year presets in market coordinates", () => {
    const dayStarts = [0, 10, 20, 30, 40];
    expect(
      getMarketRangeStart({
        rangeType: "5D",
        dataMin: -1,
        dayStarts,
        lastTimestamp: Date.UTC(2026, 6, 24),
        getRawMarketX: (index) => index * 100,
        timestampToMarketX: () => -2,
      }),
    ).toBe(0);
    expect(
      getMarketRangeStart({
        rangeType: "YTD",
        dataMin: -1,
        dayStarts,
        lastTimestamp: Date.UTC(2026, 6, 24),
        getRawMarketX: (index) => index * 100,
        timestampToMarketX: (timestamp) => timestamp,
      }),
    ).toBe(Date.UTC(2026, 0, 1));
    expect(
      getMarketRangeStart({
        rangeType: "ALL",
        dataMin: -1,
        dayStarts,
        lastTimestamp: Date.UTC(2026, 6, 24),
        getRawMarketX: (index) => index * 100,
        timestampToMarketX: (timestamp) => timestamp,
      }),
    ).toBe(-1);
  });
});
