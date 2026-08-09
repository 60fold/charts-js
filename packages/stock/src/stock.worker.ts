// Stock worker - thin wrapper around the shared stock chart renderer

import { createStockChartEngine } from "./stockRenderer.js";
import { serializeRendererError } from "@sixtyfold/core/internal/renderer";

const engine = createStockChartEngine({
  postMessage: (message) => {
    self.postMessage(message);
  },
});

let initialized = false;

self.onmessage = (e: MessageEvent) => {
  let messageType: unknown;
  try {
    const { type, ...data } = e.data;
    messageType = type;
    engine.handleMessage(type, data);
    if (type === "init") initialized = true;
  } catch (error) {
    const initializationFailure =
      messageType === "init" || (messageType === undefined && !initialized);
    self.postMessage({
      type: initializationFailure ? "initError" : "runtimeError",
      error: serializeRendererError(error),
    });
  }
};

self.onmessageerror = () => {
  self.postMessage({
    type: initialized ? "runtimeError" : "initError",
    error: serializeRendererError(
      new Error("The chart worker could not deserialize an incoming message."),
    ),
  });
};
