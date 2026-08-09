/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { snapshotRendererImageBitmaps } from "./chartOverlayRuntime";
import { MainThreadRenderer } from "./MainThreadRenderer";

const serializedError = (message: string) => ({
  message,
  stack: expect.any(String),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MainThreadRenderer", () => {
  it("does not clone a bitmap snapshot taken by DeferredRenderer twice", async () => {
    class FakeImageBitmap {
      constructor(readonly id: string) {}
      close = vi.fn();
    }
    vi.stubGlobal("ImageBitmap", FakeImageBitmap);
    const clone = new FakeImageBitmap("clone");
    const structuredClone = vi.fn(() => clone);
    vi.stubGlobal("structuredClone", structuredClone);
    const handled: Array<Record<string, any>> = [];
    const renderer = new MainThreadRenderer(() => ({
      handleMessage: (type, data) => handled.push({ type, ...data }),
    }));
    const caller = new FakeImageBitmap("caller");
    const queuedSnapshot = snapshotRendererImageBitmaps({
      type: "updateAppearance",
      patch: {
        chartBackground: {
          type: "image",
          image: caller,
          __sixtyfoldOwnsImageBitmap: true,
        },
      },
    });

    renderer.postMessage(queuedSnapshot);

    await vi.waitFor(() => expect(handled).toHaveLength(1));
    expect(structuredClone).toHaveBeenCalledOnce();
    expect(handled[0]!.patch.chartBackground.image).toBe(clone);
    expect(caller.close).not.toHaveBeenCalled();
    renderer.terminate();
  });

  it("clones shared ImageBitmaps and closes only chart-owned originals", async () => {
    class FakeImageBitmap {
      constructor(readonly id: string) {}
      close = vi.fn();
    }
    vi.stubGlobal("ImageBitmap", FakeImageBitmap);
    const clones: FakeImageBitmap[] = [];
    const clone = vi.fn((source: FakeImageBitmap) => {
      const result = new FakeImageBitmap(`${source.id}-clone`);
      clones.push(result);
      return result;
    });
    vi.stubGlobal("structuredClone", clone);

    const handled: Array<Record<string, any>> = [];
    const renderer = new MainThreadRenderer(() => ({
      handleMessage: (type, data) => handled.push({ type, ...data }),
    }));
    const callerBitmap = new FakeImageBitmap("caller");
    const decodedBitmap = new FakeImageBitmap("decoded");

    renderer.postMessage({
      type: "updateAppearance",
      patch: {
        chartBackground: {
          type: "image",
          image: callerBitmap,
          __sixtyfoldOwnsImageBitmap: true,
        },
        overlay: {
          items: [
            {
              kind: "image",
              src: callerBitmap,
              __sixtyfoldOwnsImageBitmap: true,
            },
            {
              kind: "image",
              src: decodedBitmap,
              __sixtyfoldOwnsImageBitmap: true,
              __sixtyfoldHostOwnsImageBitmap: true,
            },
          ],
        },
      },
    });

    await vi.waitFor(() => expect(handled).toHaveLength(1));
    const backgroundClone = handled[0]!.patch.chartBackground.image;
    expect(backgroundClone).not.toBe(callerBitmap);
    expect(handled[0]!.patch.overlay.items[0].src).toBe(backgroundClone);
    expect(handled[0]!.patch.overlay.items[1].src).not.toBe(decodedBitmap);
    expect(clone).toHaveBeenCalledTimes(2);
    expect(callerBitmap.close).not.toHaveBeenCalled();
    expect(decodedBitmap.close).toHaveBeenCalledOnce();

    renderer.terminate();
  });

  it("closes renderer-owned bitmap clones dropped before delivery", () => {
    class FakeImageBitmap {
      close = vi.fn();
    }
    vi.stubGlobal("ImageBitmap", FakeImageBitmap);
    const clonedBitmap = new FakeImageBitmap();
    vi.stubGlobal(
      "structuredClone",
      vi.fn(() => clonedBitmap),
    );
    const renderer = new MainThreadRenderer(() => new Promise(() => {}));

    renderer.postMessage({
      type: "updateAppearance",
      patch: {
        chartBackground: {
          type: "image",
          image: new FakeImageBitmap(),
          __sixtyfoldOwnsImageBitmap: true,
        },
      },
    });
    renderer.terminate();

    expect(clonedBitmap.close).toHaveBeenCalledOnce();
  });

  it("closes renderer-owned bitmap clones when delivery fails", async () => {
    class FakeImageBitmap {
      close = vi.fn();
    }
    vi.stubGlobal("ImageBitmap", FakeImageBitmap);
    const clonedBitmap = new FakeImageBitmap();
    vi.stubGlobal(
      "structuredClone",
      vi.fn(() => clonedBitmap),
    );
    const renderer = new MainThreadRenderer(() => ({
      handleMessage: (type) => {
        if (type === "updateAppearance") throw new Error("delivery failed");
      },
    }));
    const messages: Record<string, unknown>[] = [];
    renderer.onmessage = (event) => messages.push(event.data);

    renderer.postMessage({
      type: "updateAppearance",
      patch: {
        chartBackground: {
          type: "image",
          image: new FakeImageBitmap(),
          __sixtyfoldOwnsImageBitmap: true,
        },
      },
    });

    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(clonedBitmap.close).toHaveBeenCalledOnce();
    renderer.terminate();
  });

  it("dispatches messages asynchronously (microtask)", async () => {
    const renderer = new MainThreadRenderer(() => ({
      handleMessage: () => {},
    }));

    const handler = vi.fn();
    renderer.onmessage = handler;

    (renderer as any).dispatch({ type: "stats", value: 1 });

    expect(handler).not.toHaveBeenCalled();

    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("reports factory failures as initialization messages", async () => {
    const error = new Error("factory failed");
    const renderer = new MainThreadRenderer(() => {
      throw error;
    });
    const messages: Record<string, unknown>[] = [];
    const errorHandler = vi.fn();
    renderer.onmessage = (event) => messages.push(event.data);
    renderer.onerror = errorHandler;

    await vi.waitFor(() => {
      expect(messages).toContainEqual({
        type: "initError",
        error: serializedError("factory failed"),
      });
    });
    expect(errorHandler).not.toHaveBeenCalled();

    renderer.terminate();
  });

  it("reports post-initialization exceptions as runtime messages", async () => {
    const handled: string[] = [];
    const stop = vi.fn();
    const renderer = new MainThreadRenderer(() => ({
      handleMessage: (type) => {
        handled.push(type);
        if (type === "stop") stop();
        if (type === "explode") throw new Error("runtime failed");
      },
    }));
    const messages: Record<string, unknown>[] = [];
    const errorHandler = vi.fn();
    renderer.onmessage = (event) => messages.push(event.data);
    renderer.onerror = errorHandler;

    renderer.postMessage({ type: "explode" });

    await vi.waitFor(() => {
      expect(messages).toContainEqual({
        type: "runtimeError",
        error: serializedError("runtime failed"),
      });
    });
    expect(errorHandler).not.toHaveBeenCalled();
    expect(messages.some((message) => message.type === "initError")).toBe(false);
    expect(stop).toHaveBeenCalledOnce();

    renderer.postMessage({ type: "recover" });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(handled).not.toContain("recover");

    renderer.terminate();
  });

  it("reports an init-message exception as an initialization failure", async () => {
    const stop = vi.fn();
    const renderer = new MainThreadRenderer(() => ({
      handleMessage: (type) => {
        if (type === "stop") stop();
        if (type === "init") throw new Error("init message failed");
      },
    }));
    const messages: Record<string, unknown>[] = [];
    renderer.onmessage = (event) => messages.push(event.data);

    renderer.postMessage({ type: "init" });

    await vi.waitFor(() => {
      expect(messages).toContainEqual({
        type: "initError",
        error: serializedError("init message failed"),
      });
    });
    expect(messages.some((message) => message.type === "runtimeError")).toBe(false);
    expect(stop).toHaveBeenCalledOnce();

    renderer.terminate();
  });

  it("reports renderer-owned asynchronous failures using the current lifecycle phase", async () => {
    let reportError: ((error: unknown) => void) | undefined;
    const renderer = new MainThreadRenderer((callbacks) => {
      reportError = callbacks.reportError;
      return {
        handleMessage: () => {},
      };
    });
    const messages: Record<string, unknown>[] = [];
    renderer.onmessage = (event) => messages.push(event.data);

    await vi.waitFor(() => expect(reportError).toBeTypeOf("function"));
    reportError?.(new Error("scheduled initialization failed"));

    await vi.waitFor(() => {
      expect(messages).toContainEqual({
        type: "initError",
        error: serializedError("scheduled initialization failed"),
      });
    });
    renderer.terminate();

    let runtimeReportError: ((error: unknown) => void) | undefined;
    const runtimeRenderer = new MainThreadRenderer((callbacks) => {
      runtimeReportError = callbacks.reportError;
      callbacks.postMessage({ type: "ready" });
      return {
        handleMessage: () => {},
      };
    });
    const runtimeMessages: Record<string, unknown>[] = [];
    runtimeRenderer.onmessage = (event) => runtimeMessages.push(event.data);

    await vi.waitFor(() => expect(runtimeReportError).toBeTypeOf("function"));
    runtimeReportError?.(new Error("scheduled render failed"));

    await vi.waitFor(() => {
      expect(runtimeMessages).toContainEqual({
        type: "runtimeError",
        error: serializedError("scheduled render failed"),
      });
    });
    runtimeRenderer.terminate();
  });
});
