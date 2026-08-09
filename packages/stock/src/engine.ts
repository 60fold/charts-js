// Low-level engine entry: the raw renderer factory used by SSR and by the
// chart's own lazy main-thread fallback. Kept out of the main "." entry so the
// engine code-splits instead of bloating the worker-mode main bundle.
export * from "./stockRenderer.js";
