# Framework examples

These are complete consumers of the public Sixtyfold adapter APIs. Every
application generates and renders the same two deterministic workloads:

- **Line:** one million timestamps and five million latency values across a
  range band, p50, p99, and step-based SLO budget. This exercises
  extrema-preserving LOD, legends, tooltips, and the range selector.
- **Stock:** one million synthetic one-minute candles—six million OHLCV
  values—with volume, SMA/EMA indicators, a visible-range volume profile, a
  price line, and an event marker.

The data is generated in the browser, requires no network access, and remains
identical across frameworks so adapter behavior can be compared directly.

| Directory | Package entry points                                  |
| --------- | ----------------------------------------------------- |
| `react`   | `@sixtyfold/react/line`, `@sixtyfold/react/stock`     |
| `vue`     | `@sixtyfold/vue/line`, `@sixtyfold/vue/stock`         |
| `angular` | `@sixtyfold/angular/line`, `@sixtyfold/angular/stock` |
| `svelte`  | `@sixtyfold/svelte/line`, `@sixtyfold/svelte/stock`   |
| `solid`   | `@sixtyfold/solid/line`, `@sixtyfold/solid/stock`     |

From the repository root:

```bash
pnpm install
pnpm run build:packages
pnpm --dir examples/react dev
```

Replace `react` with `vue`, `angular`, `svelte`, or `solid`. The examples use
workspace packages while developing. To use a smaller workload while iterating,
pass a count to `createInferenceLatencyData()` or
`createSyntheticMarketData()` in the selected application.

Each generator creates transferable `Float64Array` columns. Once a worker chart
accepts a dataset, its buffers belong to that chart; call the generator again
when mounting the same workload in another chart.

Run every production build and browser smoke test with:

```bash
pnpm run check:examples
```

The browser smoke test also verifies that both million-point workloads mount
without console errors or external requests. The Angular application copies the
line and stock worker assets into its build because Angular's application
builder does not discover package-owned worker URLs automatically. See the
Angular adapter README for the required `assets` configuration.
