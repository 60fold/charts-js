# `@sixtyfold/core`

Shared runtime types and interaction primitives for Sixtyfold Charts. Most
applications install `@sixtyfold/line` or `@sixtyfold/stock`; those packages
bring core in as a dependency.

```bash
pnpm add @sixtyfold/core@next
```

```ts
import type { MultiSeriesData, Viewport } from "@sixtyfold/core";
import { DEFAULT_CHART_FONT_FAMILY } from "@sixtyfold/core";
```

Deep subpaths are exported for renderer and SSR integrations, but the root
entry point is the supported convenience surface for ordinary applications.

`getOptions()` and `getAppearance()` return copied `DeepReadonly` snapshots.
Change configuration through chart methods.

## Image ownership

Charts do not consume caller-supplied `ImageBitmap` handles used by
`chartBackground` or image overlays. Worker and main-thread rendering both send
a structured clone to the renderer and close that clone when it is replaced or
the chart is destroyed; the caller's original remains reusable. Applications
may close a construction-time background, or an overlay containing only eager
sources, after `initialize()` fulfills. If a construction overlay mixes a caller
`ImageBitmap` with a URL or another source requiring asynchronous resolution,
keep the caller handle open until the overlay is replaced or the chart is
destroyed; alternatively, after initialization, explicitly
`await chart.setOverlay(overlay)` before closing it.

Runtime backgrounds and eager-only overlays may be closed after
`updateAppearance()` returns (or after its containing `batch()` returns), even
while initialization is pending. For a runtime overlay containing an
asynchronously resolved source, call `setOverlay()` directly and keep caller
handles open until its promise settles. If every requested item fails to
resolve, `setOverlay()` rejects and leaves the previously rendered overlay in
place; when only some items fail, the successful items remain installed and the
same call still rejects with `ChartOverlayError`. Superseding a pending update
or destroying the chart is routine cancellation: the pending promise resolves
without installing and does not surface `AbortError` to the caller.

URL-backed overlay images are decoded and owned entirely by the chart. Their
fetch/decode implementation loads on demand, so primitive and eager
`ImageBitmap` overlays do not add it to the initial browser runtime.

## Third-party notices

Notices for generated runtime helper portions are in
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Licensing

This package is source-available under the
[PolyForm Noncommercial License 1.0.0](./LICENSE).

For current licensing, commercial terms, and prices, see
[Licensing and Commercial Terms](https://sixtyfold.dev/en/commercial-terms)
and [Pricing](https://sixtyfold.dev/en/pricing).
