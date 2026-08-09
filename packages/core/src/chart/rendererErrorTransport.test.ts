import { describe, expect, it } from "vitest";
import { deserializeRendererError, serializeRendererError } from "./rendererErrorTransport";

describe("renderer error transport", () => {
  it("preserves an error's message, name, and stack", () => {
    const source = new TypeError("renderer failed");
    source.stack = "TypeError: renderer failed\n    at render (renderer.ts:1:1)";

    const restored = deserializeRendererError(serializeRendererError(source));

    expect(restored).toMatchObject({
      name: "TypeError",
      message: "renderer failed",
      stack: source.stack,
    });
  });

  it("accepts legacy string payloads and non-error thrown values", () => {
    expect(deserializeRendererError("legacy failure").message).toBe("legacy failure");
    expect(serializeRendererError({ reason: "failed" })).toEqual({
      message: "[object Object]",
    });
  });

  it("preserves DOMException identity across environments", () => {
    const restored = deserializeRendererError(
      serializeRendererError(new DOMException("Cannot clone overlay", "DataCloneError")),
    );

    expect(restored).toMatchObject({
      name: "DataCloneError",
      message: "Cannot clone overlay",
    });
  });
});
