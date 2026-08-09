import type { CanvasLike, EngineCallbacks } from "../rendering/baseRenderer.js";
import {
  closeUndeliveredRendererImageBitmaps,
  snapshotRendererImageBitmaps,
} from "./chartOverlayRuntime.js";
import type { ChartWorkerLike } from "./workerInterface.js";
import { serializeRendererError } from "./rendererErrorTransport.js";

export interface ChartEngine {
  handleMessage(type: string, data: Record<string, any>): void;
}

export type EngineFactory = (
  callbacks: EngineCallbacks,
  options: { createCanvas: (w: number, h: number) => CanvasLike },
) => Promise<ChartEngine> | ChartEngine;

export class MainThreadRenderer implements ChartWorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  private engine: ChartEngine | null = null;
  private queue: Array<Record<string, any>> = [];
  private deliveryQueue: Array<Record<string, any>> = [];
  private deliveryScheduled = false;
  private terminated = false;
  private failure: unknown = null;
  private rendererReady = false;

  constructor(private readonly engineFactory: EngineFactory) {
    void this.init().catch((error) => {
      this.fail(error, "initError");
    });
  }

  postMessage(message: Record<string, any>, transfer?: Transferable[]): void {
    void transfer;
    if (this.terminated || this.failure) return;
    const rendererMessage = snapshotRendererImageBitmaps(message);
    if (this.engine) {
      this.enqueueDelivery(rendererMessage);
    } else {
      this.queue.push(rendererMessage);
    }
  }

  terminate(): void {
    this.terminated = true;
    closeUndeliveredRendererImageBitmaps(this.queue);
    closeUndeliveredRendererImageBitmaps(this.deliveryQueue);
    this.queue = [];
    this.deliveryQueue = [];
    this.deliveryScheduled = false;
    if (this.engine) {
      this.engine.handleMessage("stop", {});
    }
    this.engine = null;
  }

  private async init(): Promise<void> {
    const callbacks: EngineCallbacks = {
      postMessage: (message) => {
        if (message.type === "ready") this.rendererReady = true;
        this.dispatch(message);
      },
      reportError: (error) => {
        this.fail(error, this.rendererReady ? "runtimeError" : "initError");
      },
    };

    if (typeof document === "undefined") {
      throw new Error("MainThreadRenderer requires a DOM (document is undefined).");
    }

    const engine = await this.engineFactory(callbacks, {
      createCanvas: (w, h) => {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        return canvas;
      },
    });

    if (this.terminated || this.failure) {
      try {
        engine.handleMessage("stop", {});
      } catch {
        // A previously reported failure remains authoritative.
      }
      return;
    }

    this.engine = engine;
    const queued = this.queue;
    this.queue = [];
    for (const message of queued) {
      this.enqueueDelivery(message);
    }
  }

  private enqueueDelivery(message: Record<string, any>): void {
    this.deliveryQueue.push(message);
    if (this.deliveryScheduled) return;

    this.deliveryScheduled = true;
    setTimeout(() => {
      this.deliveryScheduled = false;
      if (this.terminated || this.failure || !this.engine) {
        this.deliveryQueue = [];
        return;
      }

      const queued = this.deliveryQueue;
      this.deliveryQueue = [];
      for (let index = 0; index < queued.length; index++) {
        if (this.terminated || this.failure || !this.engine) {
          closeUndeliveredRendererImageBitmaps(queued.slice(index));
          return;
        }
        const entry = queued[index]!;
        const { type, ...data } = entry;
        try {
          this.engine.handleMessage(type, data);
        } catch (error) {
          // close() is idempotent, so this is safe even when a renderer took
          // ownership before throwing and its stop path closes the image again.
          closeUndeliveredRendererImageBitmaps(queued.slice(index));
          this.fail(error, type === "init" ? "initError" : "runtimeError");
          return;
        }
      }
    }, 0);
  }

  private fail(error: unknown, type: "initError" | "runtimeError"): void {
    if (this.terminated || this.failure) return;
    this.failure = error;
    closeUndeliveredRendererImageBitmaps(this.queue);
    closeUndeliveredRendererImageBitmaps(this.deliveryQueue);
    this.queue = [];
    this.deliveryQueue = [];
    if (this.engine) {
      try {
        this.engine.handleMessage("stop", {});
      } catch {
        // The original failure remains the one reported to the host.
      }
      this.engine = null;
    }
    this.dispatch({ type, error: serializeRendererError(error) });
  }

  private dispatch(message: Record<string, any>): void {
    const event = { data: message } as MessageEvent;
    // Match worker semantics: postMessage delivers asynchronously. A real
    // worker.terminate() prevents any further delivery, so guard against
    // delivering messages queued just before terminate() to a destroyed chart.
    queueMicrotask(() => {
      if (this.terminated) return;
      this.onmessage?.(event);
    });
  }
}
