import type { OverlayOptions } from "./BaseChart.js";
import {
  closeOwnedOverlayImageSources,
  snapshotOverlayImageItem,
  type OverlayImageFailure,
} from "./chartOverlayRuntime.js";

const OVERLAY_IMAGE_LOAD_TIMEOUT_MS = 15_000;

export function filterDetached(overlay: OverlayOptions): {
  overlay: OverlayOptions;
  failures: OverlayImageFailure[];
} {
  const failures: OverlayImageFailure[] = [];
  const items = [];
  for (const item of overlay.items ?? []) {
    const source = item && typeof item === "object" && item.kind === "image" ? item.src : undefined;
    const failure = detachedImageBitmapFailure(source);
    if (!failure) items.push(item);
    else failures.push(failure);
  }
  return { overlay: failures.length > 0 ? { items } : overlay, failures };
}

export async function resolve(
  overlay: OverlayOptions,
  workerTransferEnabled: boolean,
  allowsDomImageOverlaySources: boolean,
  signal?: AbortSignal,
): Promise<{
  overlay: OverlayOptions;
  transfer: Transferable[];
  failures: OverlayImageFailure[];
}> {
  const items: any[] = [];
  const transfer: Transferable[] = [];
  const failures: OverlayImageFailure[] = [];

  try {
    throwIfOverlayResolutionAborted(signal);
    for (const item of overlay.items ?? []) {
      throwIfOverlayResolutionAborted(signal);
      if (!item || typeof item !== "object") continue;
      if (item.kind !== "image") {
        items.push(item);
        continue;
      }

      const src = (item as any).src;

      if (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap) {
        const failure = detachedImageBitmapFailure(src);
        if (failure) {
          failures.push(failure);
          continue;
        }
        items.push(snapshotOverlayImageItem(item));
        continue;
      }

      if (allowsDomImageOverlaySources && src && typeof src === "object") {
        items.push(item);
        continue;
      }

      if (typeof src !== "string") {
        failures.push({
          source: "[unsupported overlay image source]",
          error: new TypeError("Overlay image source cannot be used by this renderer."),
        });
        continue;
      }

      let source: CanvasImageSource | null = null;
      let bitmapError: unknown;

      try {
        if (typeof createImageBitmap !== "function") {
          throw new Error("createImageBitmap is not available");
        }
        const blob = await fetchOverlayImageBlob(src, signal);
        source = await createImageBitmap(blob);
        throwIfOverlayResolutionAborted(signal);
      } catch (error) {
        if (isOverlayResolutionAbort(error, signal)) {
          if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
            source.close();
          }
          throw error;
        }
        bitmapError = error;
      }

      let elementError: unknown;
      if (!source && allowsDomImageOverlaySources) {
        try {
          source = await loadOverlayImageElement(src, signal);
        } catch (error) {
          if (isOverlayResolutionAbort(error, signal)) throw error;
          elementError = error;
        }
      }

      if (!source) {
        failures.push({
          source: src,
          error: combineOverlayImageErrors(bitmapError, elementError),
        });
        continue;
      }

      const ownsImageBitmap = typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap;
      items.push({
        ...item,
        src: source,
        ...(ownsImageBitmap
          ? {
              __sixtyfoldOwnsImageBitmap: true,
              __sixtyfoldHostOwnsImageBitmap: true,
            }
          : {}),
      });
      if (workerTransferEnabled && ownsImageBitmap) transfer.push(source);
    }
    throwIfOverlayResolutionAborted(signal);
    return { overlay: { items }, transfer, failures };
  } catch (error) {
    closeOwnedOverlayImageSources({ items });
    throw error;
  }
}

async function fetchOverlayImageBlob(src: string, signal?: AbortSignal): Promise<Blob> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = (): void => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, OVERLAY_IMAGE_LOAD_TIMEOUT_MS);
  try {
    throwIfOverlayResolutionAborted(signal);
    const response = await fetch(src, { signal: controller.signal });
    if ("ok" in response && response.ok === false) {
      const status = "status" in response ? response.status : "unknown";
      throw new Error(`Overlay image request failed with HTTP ${status}: ${src}`);
    }
    return await response.blob();
  } catch (error) {
    if (signal?.aborted) throw createOverlayResolutionAbortError(signal);
    if (timedOut) {
      throw new Error(
        `Overlay image request timed out after ${OVERLAY_IMAGE_LOAD_TIMEOUT_MS} ms: ${src}`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

function combineOverlayImageErrors(bitmapError: unknown, elementError: unknown): Error {
  const errors = [bitmapError, elementError]
    .filter((error) => error !== undefined)
    .map((error) => (error instanceof Error ? error : new Error(String(error))));
  if (errors.length === 0) return new Error("Overlay image could not be loaded.");
  if (errors.length === 1) return errors[0]!;
  return new AggregateError(errors, "Overlay image could not be decoded by either image loader.");
}

function loadOverlayImageElement(src: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Image constructor is not available"));
      return;
    }

    const image = new Image();
    image.decoding = "async";
    if (!src.startsWith("data:") && !src.startsWith("blob:")) {
      image.crossOrigin = "anonymous";
    }
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
      image.onload = null;
      image.onerror = null;
      callback();
    };
    const abortFromCaller = (): void => {
      finish(() => {
        image.src = "";
        reject(createOverlayResolutionAbortError(signal));
      });
    };
    const timeout = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `Overlay image decode timed out after ${OVERLAY_IMAGE_LOAD_TIMEOUT_MS} ms: ${src}`,
          ),
        ),
      );
    }, OVERLAY_IMAGE_LOAD_TIMEOUT_MS);
    image.onload = () => finish(() => resolve(image));
    image.onerror = () => finish(() => reject(new Error(`Failed to load image source: ${src}`)));
    if (signal?.aborted) {
      abortFromCaller();
      return;
    }
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    image.src = src;
  });
}

function detachedImageBitmapFailure(source: unknown): OverlayImageFailure | undefined {
  if (
    typeof ImageBitmap === "undefined" ||
    !(source instanceof ImageBitmap) ||
    (source.width !== 0 && source.height !== 0)
  ) {
    return undefined;
  }
  return {
    source: "[detached ImageBitmap]",
    error: new DOMException(
      "Overlay ImageBitmap is detached and cannot be cloned.",
      "DataCloneError",
    ),
  };
}

function throwIfOverlayResolutionAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createOverlayResolutionAbortError(signal);
}

function createOverlayResolutionAbortError(signal: AbortSignal | undefined): DOMException {
  const reason = signal?.reason;
  const message =
    reason &&
    typeof reason === "object" &&
    "message" in reason &&
    typeof reason.message === "string" &&
    reason.message
      ? reason.message
      : "Overlay image resolution was cancelled.";
  return new DOMException(message, "AbortError");
}

function isOverlayResolutionAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");
}
