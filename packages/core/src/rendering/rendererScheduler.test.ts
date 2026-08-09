import { afterEach, describe, expect, it, vi } from "vitest";
import { createRendererScheduler } from "./rendererScheduler.js";

describe("renderer scheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs scheduled timer work", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const scheduler = createRendererScheduler({});

    scheduler.scheduleTask(callback, 25);
    vi.advanceTimersByTime(24);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("reports timer exceptions through the host boundary", () => {
    vi.useFakeTimers();
    const error = new Error("timer failed");
    const reportError = vi.fn();
    const scheduler = createRendererScheduler({ reportError });

    scheduler.scheduleTask(() => {
      throw error;
    }, 0);
    vi.runAllTimers();

    expect(reportError).toHaveBeenCalledWith(error);
  });

  it("reports animation-frame exceptions through the host boundary", () => {
    const error = new Error("frame failed");
    const reportError = vi.fn();
    let frameCallback: FrameRequestCallback | undefined;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      frameCallback = callback;
      return 17;
    });
    const scheduler = createRendererScheduler({ reportError });

    expect(
      scheduler.scheduleFrame(() => {
        throw error;
      }),
    ).toBe(17);
    frameCallback?.(123);

    expect(reportError).toHaveBeenCalledWith(error);
  });

  it("rethrows exceptions when the worker owns the error boundary", () => {
    let frameCallback: FrameRequestCallback | undefined;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      frameCallback = callback;
      return 1;
    });
    const scheduler = createRendererScheduler({});
    const error = new Error("worker failure");

    scheduler.scheduleFrame(() => {
      throw error;
    });

    expect(() => frameCallback?.(0)).toThrow(error);
  });
});
