// Shared chart configuration types

/** Gradient background definition */
export interface GradientOptions {
  type: "gradient";
  /** Gradient direction */
  direction: "vertical" | "horizontal";
  /** CSS color stops (minimum 2); invalid colors are skipped. */
  colors: string[];
  /** Optional positions for each color (0-1), defaults to evenly distributed */
  offsets?: number[];
}

/** Image background definition */
export interface ImageOptions {
  type: "image";
  /**
   * ImageBitmap to use as the background. The caller retains ownership of the
   * supplied handle; worker and main-thread rendering use a renderer-owned
   * structured clone. For a construction-time background, wait for initialize()
   * to fulfill before closing the caller's handle. A runtime handle may be closed
   * after updateAppearance() or its containing batch returns, including while
   * initialization is pending, because the deferred renderer snapshots it before
   * the call returns.
   */
  image: ImageBitmap;
  /** How to fit the image (default: 'cover') */
  fit?: "cover" | "contain" | "fill" | "tile";
}

/** Background fill - solid color, gradient, or image */
export type BackgroundOptions = string | GradientOptions | ImageOptions;

/** Style for a single crosshair line (vertical or horizontal) */
export interface CrosshairLineStyle {
  /** Line color (default: 'rgba(255, 255, 255, 0.3)') */
  color?: string;
  /** Line style (default: 'dashed') */
  style?: "solid" | "dashed" | "dotted";
  /** Whether the line is visible (default: true) */
  visible?: boolean;
}

/** Crosshair lines customization */
export interface CrosshairOptions {
  /** Vertical crosshair line (follows cursor X position) */
  vertical?: CrosshairLineStyle;
  /** Horizontal crosshair line (follows cursor Y position) */
  horizontal?: CrosshairLineStyle;
}
