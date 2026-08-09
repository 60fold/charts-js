import { afterEach, describe, expect, it, vi } from "vitest";
import { generateOHLCVData, loadOHLCVFromCSV, normalizeOHLCVData } from "./ohlcv";

describe("loadOHLCVFromCSV", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns empty arrays for empty CSV content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        text: async () => " \n\t ",
      })),
    );

    const onProgress = vi.fn();
    const data = await loadOHLCVFromCSV("/empty.csv", onProgress);

    expect(data.length).toBe(0);
    expect(data.timestamp.length).toBe(0);
    expect(data.open.length).toBe(0);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it("rejects unsuccessful HTTP responses without reporting completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => "",
      })),
    );

    const onProgress = vi.fn();
    await expect(loadOHLCVFromCSV("/missing.csv", onProgress)).rejects.toThrow(
      "OHLCV request failed (404): /missing.csv",
    );
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("skips a header only when the first cell is a timestamp label", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        text: async () => "timestamp,open,high,low,close,volume\n1,2,3,4,5,6",
      })),
    );

    const data = await loadOHLCVFromCSV("/header.csv");

    expect(data.length).toBe(1);
    expect(Array.from(data.timestamp)).toEqual([1]);
    expect(Array.from(data.open)).toEqual([2]);
  });

  it("does not treat t, elsewhere in the first row as a header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        text: async () => "1,2,3,4,5,t,\n6,7,8,9,10,11",
      })),
    );

    const data = await loadOHLCVFromCSV("/data-with-t.csv");

    expect(data.length).toBe(2);
    expect(Array.from(data.timestamp)).toEqual([1, 6]);
    expect(Array.from(data.volume)).toEqual([0, 11]);
  });

  it("normalizes reverse-chronological CSV rows without misaligning columns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        text: async () =>
          "timestamp,open,high,low,close,volume\n3,30,31,29,30.5,300\n2,20,21,19,20.5,200\n1,10,11,9,10.5,100",
      })),
    );

    const data = await loadOHLCVFromCSV("/descending.csv");

    expect(Array.from(data.timestamp)).toEqual([1, 2, 3]);
    expect(Array.from(data.open)).toEqual([10, 20, 30]);
    expect(Array.from(data.volume)).toEqual([100, 200, 300]);
  });

  it("keeps generated OHLC values finite when Math.random returns 0", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const data = await generateOHLCVData(4);

    expect(Array.from(data.open).every(Number.isFinite)).toBe(true);
    expect(Array.from(data.high).every(Number.isFinite)).toBe(true);
    expect(Array.from(data.low).every(Number.isFinite)).toBe(true);
    expect(Array.from(data.close).every(Number.isFinite)).toBe(true);
  });
});

describe("normalizeOHLCVData", () => {
  const data = (timestamps: number[]) => ({
    timestamp: new Float64Array(timestamps),
    open: new Float64Array([30, 20, 10]),
    high: new Float64Array([31, 21, 11]),
    low: new Float64Array([29, 19, 9]),
    close: new Float64Array([30.5, 20.5, 10.5]),
    volume: new Float64Array([300, 200, 100]),
    length: 3,
  });

  it("returns ascending buffers unchanged", () => {
    const input = data([1, 2, 3]);
    const result = normalizeOHLCVData(input);

    expect(result).toBe(input);
    expect(result.timestamp.buffer).toBe(input.timestamp.buffer);
  });

  it("rejects timestamps whose direction changes", () => {
    expect(() => normalizeOHLCVData(data([3, 1, 2]))).toThrow(
      "OHLCV timestamps must be sorted in ascending or descending order",
    );
  });
});
