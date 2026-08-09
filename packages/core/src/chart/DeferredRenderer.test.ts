/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { DeferredRenderer } from "./DeferredRenderer";
import type { ChartWorkerLike } from "./workerInterface";

const serializedError = (message: string) => ({
  message,
  stack: expect.any(String),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DeferredRenderer", () => {
  it("queues messages until the real renderer is ready", async () => {
    const forwarded = vi.fn();

    const renderer = new DeferredRenderer(async () => {
      await Promise.resolve();
      return {
        onmessage: null,
        postMessage: forwarded,
        terminate: vi.fn(),
      };
    });

    renderer.postMessage({ type: "resize", width: 100, height: 50 });
    expect(forwarded).not.toHaveBeenCalled();

    await Promise.resolve();
    await Promise.resolve();

    expect(forwarded).toHaveBeenCalledTimes(1);
    expect(forwarded).toHaveBeenCalledWith({ type: "resize", width: 100, height: 50 }, undefined);
  });

  it("dispatches initError asynchronously when loading fails", async () => {
    const renderer = new DeferredRenderer(async () => {
      throw new Error("boom");
    });

    const handler = vi.fn();
    renderer.onmessage = handler;

    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].data).toEqual({
      type: "initError",
      error: serializedError("boom"),
    });
  });

  it("drops queued messages after termination before load completes", async () => {
    let resolveTarget!: (value: ChartWorkerLike) => void;
    const terminate = vi.fn();
    const postMessage = vi.fn();

    const renderer = new DeferredRenderer(
      () =>
        new Promise<ChartWorkerLike>((resolve) => {
          resolveTarget = resolve;
        }),
    );

    renderer.postMessage({ type: "start" });
    renderer.terminate();

    resolveTarget({
      onmessage: null,
      postMessage,
      terminate,
    });

    await Promise.resolve();

    expect(postMessage).not.toHaveBeenCalled();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("snapshots a queued ImageBitmap before the caller can close it", async () => {
    class FakeImageBitmap {
      width = 8;
      height = 8;

      constructor(readonly id: string) {}

      close(): void {
        this.width = 0;
        this.height = 0;
      }
    }
    vi.stubGlobal("ImageBitmap", FakeImageBitmap);
    const clone = new FakeImageBitmap("clone");
    vi.stubGlobal(
      "structuredClone",
      vi.fn((source: FakeImageBitmap) => {
        if (source.width === 0) {
          throw new DOMException("Cannot clone a closed bitmap", "DataCloneError");
        }
        return clone;
      }),
    );

    let resolveTarget!: (value: ChartWorkerLike) => void;
    const forwarded = vi.fn();
    const renderer = new DeferredRenderer(
      () =>
        new Promise<ChartWorkerLike>((resolve) => {
          resolveTarget = resolve;
        }),
    );
    const caller = new FakeImageBitmap("caller");

    renderer.postMessage({
      type: "updateAppearance",
      patch: {
        chartBackground: {
          type: "image",
          image: caller,
          __sixtyfoldOwnsImageBitmap: true,
        },
      },
    });
    caller.close();
    resolveTarget({ onmessage: null, postMessage: forwarded, terminate: vi.fn() });

    await vi.waitFor(() => expect(forwarded).toHaveBeenCalledOnce());
    expect(forwarded.mock.calls[0]![0].patch.chartBackground.image).toBe(clone);
  });

  it("closes a queued renderer bitmap clone when terminated before loading", () => {
    class FakeImageBitmap {
      close = vi.fn();
    }
    vi.stubGlobal("ImageBitmap", FakeImageBitmap);
    const clone = new FakeImageBitmap();
    vi.stubGlobal(
      "structuredClone",
      vi.fn(() => clone),
    );
    const renderer = new DeferredRenderer(() => new Promise<ChartWorkerLike>(() => {}));

    renderer.postMessage({
      type: "setOverlay",
      overlay: {
        items: [
          {
            kind: "image",
            src: new FakeImageBitmap(),
            __sixtyfoldOwnsImageBitmap: true,
          },
        ],
      },
    });
    renderer.terminate();

    expect(clone.close).toHaveBeenCalledOnce();
  });

  it("forwards asynchronous target errors", async () => {
    let target: ChartWorkerLike | null = null;
    const renderer = new DeferredRenderer(async () => {
      target = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        postMessage: vi.fn(),
        terminate: vi.fn(),
      };
      return target;
    });
    const onerror = vi.fn();
    renderer.onerror = onerror;

    await Promise.resolve();
    await Promise.resolve();
    target!.onerror?.(new ErrorEvent("error", { message: "failed" }));

    expect(onerror).toHaveBeenCalledTimes(1);
  });

  it("reports and terminates when a queued init message cannot be delivered", async () => {
    const terminate = vi.fn();
    const renderer = new DeferredRenderer(async () => ({
      onmessage: null,
      postMessage() {
        throw new Error("init delivery failed");
      },
      terminate,
    }));
    const handler = vi.fn();
    renderer.onmessage = handler;

    renderer.postMessage({ type: "init" });
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { type: "initError", error: serializedError("init delivery failed") },
        }),
      );
    });

    expect(terminate).toHaveBeenCalledOnce();
  });

  it("reports a queued clone failure through the asynchronous runtime channel", async () => {
    let resolveTarget!: (value: ChartWorkerLike) => void;
    const terminate = vi.fn();
    const renderer = new DeferredRenderer(
      () =>
        new Promise<ChartWorkerLike>((resolve) => {
          resolveTarget = resolve;
        }),
    );
    const handler = vi.fn();
    renderer.onmessage = handler;
    renderer.postMessage({ type: "updateAppearance" });

    resolveTarget({
      onmessage: null,
      postMessage() {
        throw new DOMException("Cannot clone queued appearance", "DataCloneError");
      },
      terminate,
    });

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            type: "runtimeError",
            error: expect.objectContaining({
              name: "DataCloneError",
              message: "Cannot clone queued appearance",
            }),
          },
        }),
      );
    });
    expect(terminate).toHaveBeenCalledOnce();
  });

  it("reports a runtime delivery failure once and stops accepting messages", async () => {
    const postMessage = vi.fn((message: Record<string, unknown>) => {
      if (message.type === "explode") throw new Error("runtime delivery failed");
    });
    const terminate = vi.fn();
    const renderer = new DeferredRenderer(async () => ({
      onmessage: null,
      postMessage,
      terminate,
    }));
    const handler = vi.fn();
    renderer.onmessage = handler;

    await Promise.resolve();
    await Promise.resolve();
    renderer.postMessage({ type: "explode" });
    renderer.postMessage({ type: "ignored" });

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { type: "runtimeError", error: serializedError("runtime delivery failed") },
        }),
      );
    });
    expect(terminate).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("rethrows a ready target clone failure without terminating the renderer", async () => {
    const postMessage = vi.fn((message: Record<string, unknown>) => {
      if (message.type === "uncloneable") {
        throw new DOMException("Cannot clone overlay", "DataCloneError");
      }
    });
    const terminate = vi.fn();
    const renderer = new DeferredRenderer(async () => ({
      onmessage: null,
      postMessage,
      terminate,
    }));
    const handler = vi.fn();
    renderer.onmessage = handler;
    await Promise.resolve();
    await Promise.resolve();

    expect(() => renderer.postMessage({ type: "uncloneable" })).toThrowError(
      expect.objectContaining({ name: "DataCloneError" }),
    );
    renderer.postMessage({ type: "stillHealthy" });

    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(terminate).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});
