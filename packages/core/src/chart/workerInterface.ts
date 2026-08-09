export interface ChartWorkerLike {
  postMessage(message: Record<string, any>, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent) => void) | null;
}

export type RendererFactory = () => ChartWorkerLike;

/** Outcome of {@link selectRenderer}. */
export interface RendererSelection {
  /** The renderer to use (worker or main-thread). */
  renderer: ChartWorkerLike;
  /** True only if a worker was requested but its creation threw, so main was used. */
  usedFallback: boolean;
}

/**
 * Pick the renderer, worker-first when `useWorker` is true.
 *
 * Worker/OffscreenCanvas *support* is decided by the caller (synchronous feature
 * detection). This only guards the one remaining synchronous failure mode:
 * `new Worker()` throwing despite detection passing (e.g. a CSP blocks the
 * worker URL). In that case it transparently falls back to the main-thread
 * renderer. Callers must honour `usedFallback` so mode-dependent state (e.g.
 * OffscreenCanvas transfer) stays consistent with the renderer actually used.
 */
export function selectRenderer(
  useWorker: boolean,
  workerFactory: () => ChartWorkerLike,
  mainFactory: () => ChartWorkerLike,
): RendererSelection {
  if (useWorker) {
    try {
      return { renderer: workerFactory(), usedFallback: false };
    } catch {
      // Detection passed but worker creation was blocked — degrade to main.
    }
  }
  return { renderer: mainFactory(), usedFallback: useWorker };
}
