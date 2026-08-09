import type { OverlayOptions } from "./BaseChart.js";

const RENDERER_IMAGE_BITMAPS_SNAPSHOTTED = Symbol("sixtyfoldRendererImageBitmapsSnapshotted");

export interface OverlayImageFailure {
  source: string;
  error: unknown;
}

export function prepareOverlayForInit(
  overlay: OverlayOptions | undefined,
  allowsDomImageOverlaySources: boolean,
): { overlay: OverlayOptions | undefined; hasDeferredImages: boolean } {
  if (!overlay || !Array.isArray(overlay.items)) {
    return { overlay, hasDeferredImages: false };
  }

  const baseItems: any[] = [];
  const eagerImageItems: any[] = [];
  let hasDeferredImages = false;

  for (const item of overlay.items) {
    if (!item || typeof item !== "object") continue;
    if (item.kind !== "image") {
      baseItems.push(item);
      continue;
    }

    const src = (item as any).src;
    if (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap) {
      eagerImageItems.push(snapshotOverlayImageItem(item));
    } else if (allowsDomImageOverlaySources && src && typeof src === "object") {
      eagerImageItems.push(item);
    } else {
      hasDeferredImages = true;
    }
  }

  const items = hasDeferredImages ? baseItems : baseItems.concat(eagerImageItems);

  return {
    overlay: { items },
    hasDeferredImages,
  };
}

export function overlayNeedsAsyncResolution(
  overlay: OverlayOptions,
  allowsDomImageOverlaySources: boolean,
): boolean {
  for (const item of overlay.items ?? []) {
    if (!item || typeof item !== "object" || item.kind !== "image") continue;
    const src = (item as any).src;
    if (typeof src === "string") return true;
    if (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap) continue;
    if (src && typeof src === "object" && !allowsDomImageOverlaySources) return true;
  }
  return false;
}

/** Clone overlay structure while preserving CanvasImageSource references. */
export function snapshotOverlay(overlay: OverlayOptions): OverlayOptions {
  return {
    items: (overlay.items ?? []).map((item) => {
      if (!item || typeof item !== "object") return item;
      if (item.kind === "image") {
        return snapshotOverlayImageItem(item);
      }
      return { ...item } as any;
    }),
  };
}

export function snapshotOverlayImageItem(item: Record<string, any>): Record<string, any> {
  const snapshot = { ...item };
  const source = snapshot.src;
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    snapshot.__sixtyfoldOwnsImageBitmap = true;
    // This snapshot represents an external source. Never let a caller forge the
    // host-owned marker reserved for URL-decoded bitmaps.
    delete snapshot.__sixtyfoldHostOwnsImageBitmap;
  }
  return snapshot;
}

export function closeOwnedOverlayImageSources(message: object): void {
  const closed = new Set<ImageBitmap>();
  visitOwnedImageBitmapContainers(message, (container, image) => {
    if (container.__sixtyfoldHostOwnsImageBitmap === true && !closed.has(image)) {
      closed.add(image);
      image.close();
    }
  });
}

/**
 * Snapshot ImageBitmaps at the renderer postMessage boundary. The marker lets
 * DeferredRenderer snapshot queued messages without making MainThreadRenderer
 * clone the same handles again when its lazy module finishes loading.
 */
export function snapshotRendererImageBitmaps(message: Record<string, any>): Record<string, any> {
  if ((message as any)[RENDERER_IMAGE_BITMAPS_SNAPSHOTTED] === true) return message;
  if (
    typeof ImageBitmap === "undefined" ||
    (message.type !== "init" &&
      message.type !== "updateAppearance" &&
      message.type !== "setOverlay")
  ) {
    return message;
  }
  if (typeof structuredClone !== "function") {
    throw new DOMException(
      "This browser cannot clone ImageBitmap values for main-thread rendering.",
      "DataCloneError",
    );
  }

  const clones = new Map<ImageBitmap, ImageBitmap>();
  try {
    const clonedMessage = cloneValueImageBitmaps(message, clones) as Record<string, any>;
    Object.defineProperty(clonedMessage, RENDERER_IMAGE_BITMAPS_SNAPSHOTTED, { value: true });
    closeOwnedOverlayImageSources(message);
    return clonedMessage;
  } catch (error) {
    for (const clone of clones.values()) clone.close();
    throw error;
  }
}

export function closeUndeliveredRendererImageBitmaps(
  messages: readonly Record<string, any>[],
): void {
  const closed = new Set<ImageBitmap>();
  for (const message of messages) {
    visitOwnedImageBitmapContainers(message, (container, image) => {
      if (container.__sixtyfoldOwnsImageBitmap === true && !closed.has(image)) {
        closed.add(image);
        image.close();
      }
    });
  }
}

function cloneValueImageBitmaps(value: unknown, clones: Map<ImageBitmap, ImageBitmap>): unknown {
  if (!value || typeof value !== "object") return value;
  if (value instanceof ImageBitmap) {
    const existing = clones.get(value);
    if (existing) return existing;
    const clone = structuredClone(value);
    clones.set(value, clone);
    return clone;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValueImageBitmaps(entry, clones));
  }
  if (!isPlainRecord(value)) return value;
  const copy: Record<string, unknown> = Object.create(Object.getPrototypeOf(value));
  for (const [key, entry] of Object.entries(value)) {
    copy[key] = cloneValueImageBitmaps(entry, clones);
  }
  return copy;
}

function visitOwnedImageBitmapContainers(
  value: unknown,
  visit: (container: Record<string, any>, image: ImageBitmap) => void,
  seen = new WeakSet<object>(),
): void {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) visitOwnedImageBitmapContainers(entry, visit, seen);
    return;
  }
  if (!isPlainRecord(value)) return;
  const source = value.image ?? value.src;
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    visit(value, source);
  }
  for (const entry of Object.values(value)) {
    visitOwnedImageBitmapContainers(entry, visit, seen);
  }
}

function isPlainRecord(value: object): value is Record<string, any> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
