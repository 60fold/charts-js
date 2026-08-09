# Accessibility

Sixtyfold charts render pixels into a Canvas2D surface. The library provides
keyboard operation and baseline canvas semantics, but the application still
owns the meaningful accessible name and the text or table that explains its
data.

## Default canvas semantics

- An interactive chart defaults to `role="application"` and `tabindex="0"`.
  This lets assistive technology pass the chart's custom keyboard commands to
  the focused canvas.
- A chart constructed with `interactive: false` defaults to `role="img"` and
  does not add a tab stop.
- Existing `role`, `tabindex`, `aria-label`, `aria-labelledby`, and
  `aria-describedby` attributes are never replaced.
- Sixtyfold does not insert fallback children into the canvas. This avoids
  mutating DOM owned by a framework and leaves structured alternatives under
  application control.
- Browser focus indicators remain visible. Applications may customize
  `:focus-visible`, but should not remove the only visible focus indication.

The interactive keyboard commands are:

| Key                          | Action                                 |
| ---------------------------- | -------------------------------------- |
| `Arrow Left` / `Arrow Right` | Pan the visible X range                |
| `+` / `-`                    | Zoom around the visible-range midpoint |
| `Shift` with pan or zoom     | Use finer movement                     |
| `Home`                       | Reset the viewport                     |
| `Escape`                     | Cancel an active range selection       |

Keyboard actions that change the renderer-confirmed viewport are announced
through a hidden polite live region. Animated actions wait for the viewport to
settle, so assistive technology never receives an intermediate animation
frame. An action clamped at a data boundary is not announced, and held keys
continue moving the chart without flooding the region. Localize those short
messages with `keyboardAnnouncements`; its optional `viewport` template accepts
`{startPercent}`, `{endPercent}`, and `{spanPercent}`. Update them later with
`setKeyboardAnnouncements()`, or set `keyboardAnnouncements: false` when the
surrounding application provides its own action feedback.

## Motion and live updates

When `animated` is omitted, charts disable reveal and viewport animation if
the browser reports `prefers-reduced-motion: reduce`. An explicit
`animated: true` or `animated: false` remains authoritative. An implicitly
configured chart observes preference changes while mounted, so changing the
operating-system setting updates subsequent chart motion without remounting it.

The canvas is not an automatic ARIA live region. Streaming charts can update
many times per second, and announcing every repaint would overwhelm assistive
technology. If a meaningful status must be announced—such as a feed
disconnecting or a threshold being crossed—publish a short, throttled message
in an application-owned live region beside the chart.

## Supply an equivalent description

`Interactive chart` is only a safe development fallback. Production charts
should have a concise, localized name and an adjacent description of their
purpose, important trends, units, and time range. When exact values matter,
provide a visible table or another structured representation.

```html
<h2 id="traffic-title">Requests by region</h2>
<p id="traffic-summary">
  European traffic increased 18% during July. The chart covers six regions from 1–31 July in
  requests per minute.
</p>
<canvas
  id="traffic-chart"
  aria-labelledby="traffic-title"
  aria-describedby="traffic-summary"
></canvas>
```

Set these attributes before constructing `LineChart` or `StockChart`. Framework
adapters expose the same native canvas attributes through their idiomatic API:

| Adapter | Accessible canvas attributes                                            |
| ------- | ----------------------------------------------------------------------- |
| React   | `aria-label`, `aria-labelledby`, `aria-describedby`, `role`, `tabIndex` |
| Vue     | Fallthrough attributes such as `aria-label` and `aria-describedby`      |
| SolidJS | `canvasProps`                                                           |
| Svelte  | `ariaLabel`, `ariaDescribedBy`, `canvasRole`, `canvasTabIndex`          |
| Angular | `ariaLabel`, `ariaDescribedBy`, `canvasRole`, `canvasTabIndex` inputs   |

The HTML and ARIA standards recommend a structured alternative for complex
charts rather than attempting to encode all data in one accessible name:

- [W3C guidance for complex images](https://www.w3.org/WAI/tutorials/images/complex/)
- [HTML canvas accessibility guidance](https://html.spec.whatwg.org/multipage/canvas.html)
- [WAI-ARIA `application` role](https://www.w3.org/TR/wai-aria/#application)

## Assistive-technology verification

ARIA changes how screen readers process keyboard input, so verify the finished
application—not only the library—in at least:

- NVDA with Firefox
- JAWS with Chrome or Edge
- VoiceOver with Safari on macOS and iOS

Confirm that the chart has the intended localized name, focus is visible,
keyboard pan/zoom/reset works, surrounding content remains reachable, and the
equivalent description or table communicates the chart's essential result.
