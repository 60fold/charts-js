import type { ChartWorkerLike } from "./workerInterface.js";
import {
  closeUndeliveredRendererImageBitmaps,
  snapshotRendererImageBitmaps,
} from "./chartOverlayRuntime.js";
import { serializeRendererError } from "./rendererErrorTransport.js";

interface QueuedMessage {
  message: Record<string, any>;
  transfer?: Transferable[];
}

/**
 * Lightweight async adapter that lets chart constructors keep a synchronous
 * worker-like interface while deferring creation of the real renderer.
 */
export class DeferredRenderer implements ChartWorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;

  private target: ChartWorkerLike | null = null;
  private queue: QueuedMessage[] = [];
  private terminated = false;
  private failed = false;

  constructor(loader: () => Promise<ChartWorkerLike>) {
    void loader().then(
      (target) => {
        if (this.terminated || this.failed) {
          target.terminate();
          return;
        }

        this.target = target;
        target.onmessage = (event) => {
          this.onmessage?.(event);
        };
        target.onerror = (event) => {
          this.onerror?.(event);
        };
        target.onmessageerror = (event) => {
          this.onmessageerror?.(event);
        };

        const queued = this.queue;
        this.queue = [];
        for (let index = 0; index < queued.length; index++) {
          const { message, transfer } = queued[index]!;
          try {
            target.postMessage(message, transfer);
          } catch (error) {
            // This delivery boundary is asynchronous, so there is no active
            // postMessage caller to receive a synchronous DataCloneError. Route
            // it through the renderer lifecycle channel like any queued failure.
            closeUndeliveredRendererImageBitmaps(queued.slice(index).map((entry) => entry.message));
            this.fail(error, message.type === "init" ? "initError" : "runtimeError");
            return;
          }
        }
      },
      (error) => this.fail(error, "initError"),
    );
  }

  postMessage(message: Record<string, any>, transfer?: Transferable[]): void {
    if (this.terminated || this.failed) return;
    if (this.target) {
      try {
        this.target.postMessage(message, transfer);
      } catch (error) {
        // Match Worker.postMessage(): clone failures are synchronous caller
        // errors and do not make an otherwise healthy renderer unusable.
        if (error instanceof DOMException && error.name === "DataCloneError") throw error;
        this.fail(error, message.type === "init" ? "initError" : "runtimeError");
      }
    } else {
      try {
        this.queue.push({ message: snapshotRendererImageBitmaps(message), transfer });
      } catch (error) {
        if (error instanceof DOMException && error.name === "DataCloneError") throw error;
        this.fail(error, message.type === "init" ? "initError" : "runtimeError");
      }
    }
  }

  terminate(): void {
    this.terminated = true;
    closeUndeliveredRendererImageBitmaps(this.queue.map((entry) => entry.message));
    this.queue = [];
    this.target?.terminate();
    this.target = null;
  }

  private fail(error: unknown, type: "initError" | "runtimeError"): void {
    if (this.terminated || this.failed) return;
    this.failed = true;
    closeUndeliveredRendererImageBitmaps(this.queue.map((entry) => entry.message));
    this.queue = [];
    this.target?.terminate();
    this.target = null;
    this.dispatch({ type, error: serializeRendererError(error) });
  }

  private dispatch(message: Record<string, any>): void {
    const event = { data: message } as MessageEvent;
    queueMicrotask(() => {
      this.onmessage?.(event);
    });
  }
}
