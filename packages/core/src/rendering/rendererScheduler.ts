import type { EngineCallbacks } from "./baseRenderer.js";

interface RendererScheduler {
  scheduleTask(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  scheduleFrame(callback: FrameRequestCallback): number;
}

/**
 * Route errors from renderer-owned timers and animation frames through the
 * main-thread renderer boundary. Worker renderers omit `reportError`, allowing
 * the exception to reach the worker's native error event.
 *
 * @internal
 */
export function createRendererScheduler(
  callbacks: Pick<EngineCallbacks, "reportError">,
): RendererScheduler {
  function run(callback: () => void): void {
    try {
      callback();
    } catch (error) {
      if (callbacks.reportError) {
        callbacks.reportError(error);
        return;
      }
      throw error;
    }
  }

  return {
    scheduleTask(callback, delayMs) {
      return setTimeout(() => run(callback), delayMs);
    },
    scheduleFrame(callback) {
      return requestAnimationFrame((timestamp) => run(() => callback(timestamp)));
    },
  };
}
