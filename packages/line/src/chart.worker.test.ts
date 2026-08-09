import { beforeEach, describe, expect, it, vi } from "vitest";

const renderer = vi.hoisted(() => ({
  handleMessage: vi.fn(),
}));

vi.mock("./lineRenderer.js", () => ({
  createLineChartEngine: () => renderer,
}));

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
}

const serializedError = (message: string) => ({
  message,
  stack: expect.any(String),
});

describe("line chart worker", () => {
  let scope: WorkerScope;

  beforeEach(async () => {
    vi.resetModules();
    renderer.handleMessage.mockReset();
    scope = {
      onmessage: null,
      onmessageerror: null,
      postMessage: vi.fn(),
    };
    vi.stubGlobal("self", scope);
    await import("./chart.worker.js");
  });

  it.each([
    { incoming: "init", outgoing: "initError" },
    { incoming: "setData", outgoing: "runtimeError" },
  ])("reports $incoming exceptions as $outgoing", ({ incoming, outgoing }) => {
    renderer.handleMessage.mockImplementationOnce(() => {
      throw new Error(`${incoming} failed`);
    });

    scope.onmessage?.(new MessageEvent("message", { data: { type: incoming } }));

    expect(scope.postMessage).toHaveBeenCalledWith({
      type: outgoing,
      error: serializedError(`${incoming} failed`),
    });
  });

  it("classifies message deserialization failures by initialization state", () => {
    scope.onmessageerror?.(new MessageEvent("messageerror"));
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: "initError",
      error: serializedError("The chart worker could not deserialize an incoming message."),
    });

    scope.onmessage?.(new MessageEvent("message", { data: { type: "init" } }));
    scope.onmessageerror?.(new MessageEvent("messageerror"));
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: "runtimeError",
      error: serializedError("The chart worker could not deserialize an incoming message."),
    });
  });

  it("classifies malformed messages by initialization state", () => {
    scope.onmessage?.(new MessageEvent("message", { data: null }));
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: "initError",
      error: expect.objectContaining({ message: expect.any(String) }),
    });

    scope.onmessage?.(new MessageEvent("message", { data: { type: "init" } }));
    scope.onmessage?.(new MessageEvent("message", { data: null }));
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: "runtimeError",
      error: expect.objectContaining({ message: expect.any(String) }),
    });
  });

  it("forwards ordinary messages to the renderer", () => {
    scope.onmessage?.(
      new MessageEvent("message", {
        data: { type: "setViewport", xMin: 10, xMax: 20 },
      }),
    );

    expect(renderer.handleMessage).toHaveBeenCalledWith("setViewport", {
      xMin: 10,
      xMax: 20,
    });
    expect(scope.postMessage).not.toHaveBeenCalled();
  });
});
