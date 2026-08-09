/**
 * Test doubles for the imperative chart engines.
 *
 * The framework adapters are thin lifecycle wrappers: their job is to call the
 * engine the right number of times, in the right order, with the right
 * arguments. Constructing a real chart needs OffscreenCanvas and a Worker, so
 * these doubles stand in and record the call sequence instead.
 */

export interface RecordedCall {
  method: string;
  args: unknown[];
  /** True when the call happened inside a batch() callback. */
  inBatch: boolean;
}

export class FakeChart {
  /** Every instance constructed since the last resetFakeCharts(). */
  static instances: FakeChart[] = [];

  readonly canvas: HTMLCanvasElement;
  readonly options: unknown;
  readonly calls: RecordedCall[] = [];
  destroyed = false;
  statsCallback: ((stats: unknown) => void) | null = null;
  seriesVisibilityCallback: ((event: unknown) => void) | null = null;
  rendererErrorCallback: ((error: unknown) => void) | null = null;
  overlayErrorCallback: ((error: unknown) => void) | null = null;

  private batchDepth = 0;
  private readonly ready: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (reason: unknown) => void;

  /** Set to make construction throw, as a real chart does when the canvas
   *  cannot be transferred to an offscreen context. */
  static constructorError: unknown = null;

  constructor(canvas: HTMLCanvasElement, options: unknown) {
    // new.target so a subclass registry gets its own error and instance list.
    const type = (new.target ?? FakeChart) as typeof FakeChart;
    if (type.constructorError) throw type.constructorError;
    this.canvas = canvas;
    this.options = options;
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // Mirrors BaseChart: rejection is always observed, so a chart destroyed
    // before initialization never produces an unhandled rejection.
    void this.ready.catch(() => {});
    type.instances.push(this);
  }

  // --- engine surface used by the adapters ---

  initialize(): Promise<void> {
    return this.ready;
  }

  batch(fn: () => void): void {
    this.batchDepth++;
    try {
      fn();
    } finally {
      this.batchDepth--;
    }
  }

  setData(data: unknown, options?: unknown): void {
    this.record("setData", [data, options]);
  }

  setMultiSeriesData(data: unknown, options?: unknown): void {
    this.record("setMultiSeriesData", [data, options]);
  }

  updateAppearance(patch: unknown): void {
    this.record("updateAppearance", [patch]);
  }

  setViewport(viewport: unknown, options?: { animated?: boolean }): void {
    this.record("setViewport", [viewport, options]);
  }

  setStatsCallback(callback: ((stats: unknown) => void) | null, options?: unknown): void {
    this.statsCallback = callback;
    this.record("setStatsCallback", [callback, options]);
  }

  setSeriesVisibilityCallback(callback: (event: unknown) => void): void {
    this.seriesVisibilityCallback = callback;
    this.record("setSeriesVisibilityCallback", [callback]);
  }

  setRendererErrorCallback(callback: ((error: unknown) => void) | null): void {
    this.rendererErrorCallback = callback;
    this.record("setRendererErrorCallback", [callback]);
  }

  setOverlayErrorCallback(callback: ((error: unknown) => void) | null): void {
    this.overlayErrorCallback = callback;
    this.record("setOverlayErrorCallback", [callback]);
  }

  destroy(): void {
    this.destroyed = true;
    this.rendererErrorCallback = null;
    this.overlayErrorCallback = null;
    this.record("destroy", []);
    this.rejectReady(new DOMException("Chart was destroyed before initialization.", "AbortError"));
  }

  // --- test controls ---

  /** Resolve the pending initialize(). */
  becomeReady(): void {
    this.resolveReady();
  }

  /** Reject the pending initialize(). */
  failInitialization(reason: unknown): void {
    const callback = this.rendererErrorCallback;
    this.rendererErrorCallback = null;
    callback?.(reason);
    this.rejectReady(reason);
  }

  /** Report a renderer failure after initialize() has resolved. */
  failRuntime(reason: unknown): void {
    const callback = this.rendererErrorCallback;
    this.rendererErrorCallback = null;
    callback?.(reason);
  }

  /** Report a failed overlay image through the adapter's ordinary error hook. */
  failOverlay(reason: unknown): void {
    this.overlayErrorCallback?.(reason);
  }

  callsTo(method: string): RecordedCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  /** Ordered method names, for asserting call sequence. */
  get methodOrder(): string[] {
    return this.calls.map((call) => call.method);
  }

  private record(method: string, args: unknown[]): void {
    this.calls.push({ method, args, inBatch: this.batchDepth > 0 });
  }
}

/** Distinct subclasses so line and stock instances never share a registry. */
export class FakeLineChart extends FakeChart {
  static override instances: FakeChart[] = [];
  static override constructorError: unknown = null;
}

export class FakeStockChart extends FakeChart {
  static override instances: FakeChart[] = [];
  static override constructorError: unknown = null;
}

export function resetFakeCharts(): void {
  for (const type of [FakeChart, FakeLineChart, FakeStockChart]) {
    type.instances = [];
    type.constructorError = null;
  }
}

/** The most recently constructed instance, failing loudly when there is none. */
export function lastChart(type: typeof FakeChart): FakeChart {
  const instance = type.instances.at(-1);
  if (!instance) throw new Error(`No ${type.name} was constructed`);
  return instance;
}
