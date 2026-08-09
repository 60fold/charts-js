/** Serializable subset of an Error used across renderer message boundaries. */
export interface SerializedRendererError {
  message: string;
  name?: string;
  stack?: string;
}

export function serializeRendererError(error: unknown): SerializedRendererError {
  if (
    error instanceof Error ||
    (typeof DOMException !== "undefined" && error instanceof DOMException)
  ) {
    return {
      message: error.message,
      ...(error.name && error.name !== "Error" ? { name: error.name } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return { message: String(error) };
}

export function deserializeRendererError(value: unknown): Error {
  if (typeof value === "string") return new Error(value);
  if (!value || typeof value !== "object") return new Error(String(value));

  const payload = value as Partial<SerializedRendererError>;
  const error = new Error(typeof payload.message === "string" ? payload.message : String(value));
  if (typeof payload.name === "string" && payload.name) error.name = payload.name;
  if (typeof payload.stack === "string" && payload.stack) error.stack = payload.stack;
  return error;
}
