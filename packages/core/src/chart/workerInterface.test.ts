import { describe, it, expect, vi } from "vitest";
import { selectRenderer, type ChartWorkerLike } from "./workerInterface";

const stub = (): ChartWorkerLike => ({
  postMessage: () => {},
  terminate: () => {},
  onmessage: null,
});

describe("selectRenderer", () => {
  it("uses the worker when requested and creation succeeds", () => {
    const worker = stub();
    const workerFactory = vi.fn(() => worker);
    const mainFactory = vi.fn(stub);

    const sel = selectRenderer(true, workerFactory, mainFactory);

    expect(sel.renderer).toBe(worker);
    expect(sel.usedFallback).toBe(false);
    expect(mainFactory).not.toHaveBeenCalled();
  });

  it("falls back to main when worker creation throws (e.g. CSP)", () => {
    const main = stub();
    const workerFactory = vi.fn(() => {
      throw new Error("blocked by CSP");
    });
    const mainFactory = vi.fn(() => main);

    const sel = selectRenderer(true, workerFactory, mainFactory);

    expect(sel.renderer).toBe(main);
    expect(sel.usedFallback).toBe(true);
    expect(mainFactory).toHaveBeenCalledOnce();
  });

  it("uses main directly when worker is not requested, without touching the worker factory", () => {
    const main = stub();
    const workerFactory = vi.fn(stub);
    const mainFactory = vi.fn(() => main);

    const sel = selectRenderer(false, workerFactory, mainFactory);

    expect(sel.renderer).toBe(main);
    expect(sel.usedFallback).toBe(false);
    expect(workerFactory).not.toHaveBeenCalled();
  });
});
