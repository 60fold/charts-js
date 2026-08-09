// Shared unit configuration types

/** Common font style configuration */
export interface FontStyle {
  /** Font size in pixels (default varies by context) */
  size?: number;
  /** Font weight (default: 'normal') */
  weight?: string | number;
  /** Text color */
  color?: string;
  /** Font family (default: `DEFAULT_CHART_FONT_FAMILY`) */
  family?: string;
}

/** Text direction used for Canvas2D text layout. */
export type TextDirection = "ltr" | "rtl" | "auto" | "inherit";

/** Horizontal text alignment, including logical start/end alignment. */
export type TextAlign = "left" | "center" | "right" | "start" | "end";

/** Configuration for formatting values with units */
export interface UnitOptions {
  /** Prefix to display before the value (e.g., "$") */
  prefix?: string;
  /** Suffix to display after the value (e.g., "%", " USD") */
  suffix?: string;
  /** Number of decimal places (default: 2) */
  decimals?: number;
  /** Display name for the series/axis (e.g., "Price", "Volume") */
  name?: string;
  /** Formatting style: "default" for fixed decimals, "compact" for K/M/B notation */
  formatStyle?: "default" | "compact";
}

/** Clamp decimals to valid toFixed range (0-100), defaulting to 2 for invalid values */
function clampDecimals(decimals: number): number {
  if (!Number.isFinite(decimals)) return 2;
  return Math.max(0, Math.min(100, Math.floor(decimals)));
}

// Compact notation tiers (Trillion, Billion, Million, Kilo)
const COMPACT_TIERS: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

/** Format absolute value in compact notation (K, M, B) - no sign */
function formatCompactAbs(absValue: number, decimals: number): string {
  // Round to the specified decimals first to determine correct tier
  for (const [threshold, suffix] of COMPACT_TIERS) {
    const scaled = absValue / threshold;
    const fixed = scaled.toFixed(decimals); // Cache to avoid double toFixed
    const rounded = parseFloat(fixed);
    // Use this tier if rounded value is >= 1 and < 1000
    if (rounded >= 1 && rounded < 1000) {
      return fixed + suffix;
    }
  }
  return absValue.toFixed(decimals);
}

/** Format a value using unit configuration.
 *  Negative sign is placed before prefix: -$69.33 not $-69.33 */
export function formatValue(value: number, unit?: UnitOptions, defaultDecimals = 2): string {
  // Handle NaN and Infinity (apply prefix/suffix for consistency)
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) {
    const sign = value > 0 ? "" : "-";
    const prefix = unit?.prefix ?? "";
    const suffix = unit?.suffix ?? "";
    return `${sign}${prefix}Inf${suffix}`;
  }

  const safeDefault = clampDecimals(defaultDecimals);
  if (!unit) {
    return value.toFixed(safeDefault);
  }

  const decimals = clampDecimals(unit.decimals ?? defaultDecimals);
  const absValue = Math.abs(value);

  let formatted: string;
  if (unit.formatStyle === "compact") {
    formatted = formatCompactAbs(absValue, decimals);
  } else {
    formatted = absValue.toFixed(decimals);
  }

  // Suppress negative sign if formatted value is zero (avoid -$0.00)
  const sign = value < 0 && parseFloat(formatted) !== 0 ? "-" : "";

  return `${sign}${unit.prefix ?? ""}${formatted}${unit.suffix ?? ""}`;
}
