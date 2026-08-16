# `@sixtyfold/themes`

Immutable, content-neutral appearance presets for Sixtyfold Line and Stock
charts.

```bash
pnpm add @sixtyfold/themes@next
```

```ts
import { LineChart } from "@sixtyfold/line";
import { getLineThemePreset } from "@sixtyfold/themes/line";

const chart = new LineChart(canvas, options);
const theme = getLineThemePreset("blueprint");

chart.updateAppearance(theme.line.appearance);
theme.line.series.forEach((appearance, index) => {
  chart.updateSeriesAppearance(index, appearance);
});
```

Use `PUBLIC_THEME_IDS` for stable control values and `PUBLIC_THEMES` when a
keyed catalog is more convenient. Presets are recursively frozen. Clone a
preset before modifying it.

`@sixtyfold/line` and `@sixtyfold/stock` are optional peers. Line-only
applications import `@sixtyfold/themes/line`; stock-only applications import
`@sixtyfold/themes/stock`. These entry points keep the other renderer out of
both installation and TypeScript declaration resolution. The root entry point
retains the combined catalog for applications that use both chart types.

## Licensing

This package is source-available under the
[PolyForm Noncommercial License 1.0.0](./LICENSE).

For current licensing, commercial terms, and prices, see
[Licensing and Commercial Terms](https://sixtyfold.dev/en/commercial-terms)
and [Pricing](https://sixtyfold.dev/en/pricing).
