# `@sixtyfold/ssr`

Server-side Canvas2D rendering for Sixtyfold line and stock charts. Supply a
canvas implementation such as `@napi-rs/canvas`; Sixtyfold does not force a
specific canvas dependency on consumers.

```bash
pnpm add @sixtyfold/ssr@next @napi-rs/canvas
```

```ts
import { createCanvas } from "@napi-rs/canvas";
import { renderLineChartSSR } from "@sixtyfold/ssr";

const canvas = createCanvas(1200, 600);

renderLineChartSSR(
  canvas,
  {
    x: new Float64Array([0, 1, 2]),
    series: [new Float64Array([4, 7, 5])],
    length: 3,
    seriesCount: 1,
  },
  { animated: false },
  { width: 1200, height: 600, dpr: 1 },
);

const png = canvas.toBuffer("image/png");
```

`@napi-rs/canvas` is shown only as an example and is not a dependency of this
package.

## Verified server runtimes

The same ESM package and `@napi-rs/canvas` backend render and encode real PNG
output in the current compatibility table:

| Runtime | CI version | Command                                                                                               |
| ------- | ---------: | ----------------------------------------------------------------------------------------------------- |
| Node.js |    22.22.3 | `node app.mjs`                                                                                        |
| Bun     |     1.3.14 | `bun app.mjs`                                                                                         |
| Deno    |      2.9.3 | `deno run --allow-read --allow-env --allow-ffi --allow-sys=homedir --node-modules-dir=manual app.mjs` |

Deno needs a local `node_modules` tree for the Node-API canvas addon. Its
permissions allow module and font discovery, environment inspection, native
addon loading, and the canvas backend's home-directory lookup. Add
`--allow-write=<output-directory>` only when the application writes encoded
images to disk.

Maintainers can run the complete runtime compatibility set with:

```bash
pnpm run test:ssr:runtimes
```

The compatibility test renders Line and Stock fixtures without network access,
checks plot pixels against a pinned visual reference, and requires every named
label to produce visible ink at its exact layout anchor inside a bounded region.
The text check does not pin font-dependent glyph widths or ink ratios across
operating systems. It also validates PNG signatures and dimensions and writes
inspectable files under `artifacts/ssr-runtimes/`.

Before either release workflow publishes, the Node visual reference is repeated
on Ubuntu, macOS, and Windows.
