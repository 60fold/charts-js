/** A horizontal, data-anchored price level rendered over the stock chart. */
export interface StockPriceLine {
  /** Optional stable application-defined identifier retained with the price line. */
  id?: string;
  /** Price represented by the horizontal line. */
  price: number;
  /** Optional text rendered alongside the line. */
  label?: string;
  /** Line color. */
  color?: string;
  /** Line width in CSS pixels. */
  lineWidth?: number;
  /** Canvas dash pattern. An empty array renders a solid line. */
  lineDash?: number[];
  /** Show a value label on the price axis. */
  showAxisLabel?: boolean;
  /** Text color for the optional axis label. */
  axisLabelColor?: string;
  /** Background color for the optional axis label. */
  axisLabelBackground?: string;
  /** Include this price when calculating the visible Y scale. */
  extendScale?: boolean;
}

/** Glyphs supported by data-anchored stock markers. */
export type StockMarkerShape = "circle" | "square" | "diamond" | "triangle-up" | "triangle-down";

/** Vertical anchor used when positioning a stock marker. */
export type StockMarkerPosition = "above" | "below" | "price";

/** A sparse event/trade marker anchored to a timestamp and optionally a price. */
export interface StockMarker {
  /** Optional stable application-defined identifier retained with the marker. */
  id?: string;
  /** Marker timestamp, in the same units as the chart data. */
  timestamp: number;
  /** Explicit price anchor. Required when position is `price`. */
  price?: number;
  /** Place above/below the nearest candle or at an explicit price. */
  position?: StockMarkerPosition;
  /** Marker glyph. */
  shape?: StockMarkerShape;
  /** Optional short marker label. */
  label?: string;
  /** Marker fill color. */
  color?: string;
  /** Marker label color. */
  textColor?: string;
  /** Marker radius/half-size in CSS pixels. */
  size?: number;
}

/**
 * Estimated visible-range volume-by-price histogram configuration.
 *
 * The renderer distributes each OHLCV candle's volume uniformly across its
 * reported low-to-high range. This is a candle-derived approximation, not
 * exact trades-at-price or order-flow data.
 */
export interface VolumeProfileOptions {
  /** Whether the profile is rendered. Defaults to true when configured. */
  visible?: boolean;
  /** Number of estimated price buckets. */
  rows?: number;
  /** Maximum profile width in CSS pixels. */
  width?: number;
  /** Side of the price pane on which the profile is anchored. */
  placement?: "left" | "right";
  /** Percentage of volume included in the value area. */
  valueAreaPercent?: number;
  /** Profile opacity in the inclusive range 0..1. */
  opacity?: number;
  /** Color assigned to bullish volume. */
  upColor?: string;
  /** Color assigned to bearish volume. */
  downColor?: string;
  /** Highlight the point-of-control row. */
  showPointOfControl?: boolean;
  /** Point-of-control highlight color. */
  pointOfControlColor?: string;
}
