/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeOwnedOverlayImageSources,
  closeUndeliveredRendererImageBitmaps,
} from "./chartOverlayRuntime";
import {
  filterDetached as filterDetachedOverlayImages,
  resolve as resolveOverlayImages,
} from "./overlay";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("resolveOverlayImages", () => {
  it("detects a caller ImageBitmap detached after resolution", () => {
    class FakeImageBitmap {
      width = 8;
      height = 8;

      close(): void {
        this.width = 0;
        this.height = 0;
      }
    }

    vi.stubGlobal("ImageBitmap", FakeImageBitmap);
    const source = new FakeImageBitmap();
    const validItem = {
      kind: "rect" as const,
      x: 10,
      y: 10,
      width: 4,
      height: 4,
    };
    const overlay = {
      items: [
        validItem,
        {
          kind: "image" as const,
          src: source as unknown as ImageBitmap,
          x: 0,
          y: 0,
          width: 8,
          height: 8,
        },
      ],
    };
    source.close();

    const result = filterDetachedOverlayImages(overlay);
    expect(result.overlay.items).toEqual([validItem]);
    expect(result.failures).toEqual([
      {
        source: "[detached ImageBitmap]",
        error: expect.objectContaining({ name: "DataCloneError" }),
      },
    ]);
  });

  it("reports a detached caller ImageBitmap consistently before renderer delivery", async () => {
    class FakeImageBitmap {
      width = 0;
      height = 0;
    }

    vi.stubGlobal("ImageBitmap", FakeImageBitmap);
    const result = await resolveOverlayImages(
      {
        items: [
          {
            kind: "image",
            src: new FakeImageBitmap() as unknown as ImageBitmap,
            x: 0,
            y: 0,
            width: 10,
            height: 10,
          },
        ],
      },
      false,
      true,
    );

    expect(result.overlay.items).toEqual([]);
    expect(result.failures).toEqual([
      {
        source: "[detached ImageBitmap]",
        error: expect.objectContaining({ name: "DataCloneError" }),
      },
    ]);
  });

  it("rejects non-successful HTTP responses before decoding", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        blob: async () => new Blob(),
      })),
    );

    const result = await resolveOverlayImages(
      {
        items: [
          {
            kind: "image",
            src: "https://example.test/missing.png",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
          },
        ],
      },
      false,
      false,
    );

    expect(result.overlay.items).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.error).toMatchObject({
      message: "Overlay image request failed with HTTP 404: https://example.test/missing.png",
    });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("aborts an overlay request that does not settle", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("createImageBitmap", vi.fn());
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );

    const pending = resolveOverlayImages(
      {
        items: [
          {
            kind: "image",
            src: "https://example.test/slow.png",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
          },
        ],
      },
      false,
      false,
    );

    await vi.advanceTimersByTimeAsync(15_000);
    const result = await pending;

    expect(result.failures[0]?.error).toMatchObject({
      message: "Overlay image request timed out after 15000 ms: https://example.test/slow.png",
      cause: expect.objectContaining({ name: "AbortError" }),
    });
  });

  it("preserves bitmap and DOM image loader failures", async () => {
    class FailingImage {
      decoding = "";
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }

    vi.stubGlobal("Image", FailingImage);
    vi.stubGlobal("createImageBitmap", vi.fn());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network failed");
      }),
    );

    const result = await resolveOverlayImages(
      {
        items: [
          {
            kind: "image",
            src: "https://example.test/broken.png",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
          },
        ],
      },
      false,
      true,
    );

    const error = result.failures[0]?.error;
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([
      expect.objectContaining({ message: "network failed" }),
      expect.objectContaining({
        message: "Failed to load image source: https://example.test/broken.png",
      }),
    ]);
  });

  it("closes decoded bitmaps when a later image is cancelled", async () => {
    class FakeImageBitmap {
      close = vi.fn();
    }

    const firstBitmap = new FakeImageBitmap();
    const controller = new AbortController();
    let secondRequestStarted!: () => void;
    const secondRequest = new Promise<void>((resolve) => {
      secondRequestStarted = resolve;
    });
    let requestCount = 0;

    vi.stubGlobal("ImageBitmap", FakeImageBitmap);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => firstBitmap),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        requestCount++;
        if (requestCount === 1) {
          return Promise.resolve({
            ok: true,
            blob: async () => new Blob(),
          } as Response);
        }
        secondRequestStarted();
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      }),
    );

    const pending = resolveOverlayImages(
      {
        items: [
          {
            kind: "image",
            src: "https://example.test/first.png",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
          },
          {
            kind: "image",
            src: "https://example.test/second.png",
            x: 10,
            y: 0,
            width: 10,
            height: 10,
          },
        ],
      },
      false,
      false,
      controller.signal,
    );

    await secondRequest;
    controller.abort(new DOMException("Superseded", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(firstBitmap.close).toHaveBeenCalledOnce();
  });

  it("closes a bitmap whose decode completes after cancellation", async () => {
    class FakeImageBitmap {
      close = vi.fn();
    }

    const bitmap = new FakeImageBitmap();
    const controller = new AbortController();
    let finishDecode!: (value: FakeImageBitmap) => void;
    vi.stubGlobal("ImageBitmap", FakeImageBitmap);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(),
      })),
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => new Promise<FakeImageBitmap>((resolve) => (finishDecode = resolve))),
    );

    const pending = resolveOverlayImages(
      {
        items: [
          {
            kind: "image",
            src: "https://example.test/decode.png",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
          },
        ],
      },
      false,
      false,
      controller.signal,
    );

    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledOnce());
    controller.abort(new DOMException("Superseded", "AbortError"));
    finishDecode(bitmap);

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("deduplicates owned bitmap cleanup", () => {
    class FakeImageBitmap {
      close = vi.fn();
    }
    vi.stubGlobal("ImageBitmap", FakeImageBitmap);
    const bitmap = new FakeImageBitmap();
    closeOwnedOverlayImageSources({
      items: [
        {
          kind: "image",
          src: bitmap as unknown as CanvasImageSource,
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          __sixtyfoldOwnsImageBitmap: true,
          __sixtyfoldHostOwnsImageBitmap: true,
        } as any,
        {
          kind: "image",
          src: bitmap as unknown as CanvasImageSource,
          x: 10,
          y: 0,
          width: 10,
          height: 10,
          __sixtyfoldOwnsImageBitmap: true,
          __sixtyfoldHostOwnsImageBitmap: true,
        } as any,
      ],
    });

    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("does not close a caller bitmap merely marked as renderer-owned", () => {
    class FakeImageBitmap {
      close = vi.fn();
    }
    vi.stubGlobal("ImageBitmap", FakeImageBitmap);
    const bitmap = new FakeImageBitmap();
    closeOwnedOverlayImageSources({
      items: [
        {
          kind: "image",
          src: bitmap as unknown as CanvasImageSource,
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          __sixtyfoldOwnsImageBitmap: true,
        } as any,
      ],
    });

    expect(bitmap.close).not.toHaveBeenCalled();
  });

  it("never treats a duck-typed closable object as an owned ImageBitmap", () => {
    class FakeImageBitmap {}
    vi.stubGlobal("ImageBitmap", FakeImageBitmap);
    const source = { close: vi.fn() };

    closeUndeliveredRendererImageBitmaps([
      {
        type: "init",
        config: {
          chartBackground: {
            type: "image",
            image: source,
            __sixtyfoldOwnsImageBitmap: true,
          },
        },
      },
    ]);

    expect(source.close).not.toHaveBeenCalled();
  });
});
