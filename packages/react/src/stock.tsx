import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type CanvasHTMLAttributes,
} from "react";
import type { DeepPartial, Viewport } from "@sixtyfold/core";
import {
  StockChart,
  type OHLCVData,
  type StockAppearanceOptions,
  type StockChartOptions,
  type StockChartStats,
} from "@sixtyfold/stock";
import { hasViewport, type ChartHandle } from "./shared.js";

export type StockChartHandle = ChartHandle<StockChart>;

export interface SixtyfoldStockChartProps extends Omit<
  CanvasHTMLAttributes<HTMLCanvasElement>,
  "children"
> {
  /** Construction-time options. Remount the component to replace them. */
  options?: StockChartOptions;
  /**
   * One-shot chart data. Supply a new object for each update. Worker mode
   * transfers and detaches its buffers; main-thread mode retains references.
   */
  data?: OHLCVData;
  appearance?: DeepPartial<StockAppearanceOptions>;
  viewport?: Partial<Viewport>;
  /** Leave undefined to inherit the chart's configured `animated` default. */
  viewportAnimated?: boolean;
  onReady?: (chart: StockChart) => void;
  /** Reports construction, renderer, and overlay-image failures. */
  onError?: (error: unknown) => void;
  onStats?: (stats: StockChartStats) => void;
  statsIntervalMs?: number;
}

/** React host for a Sixtyfold stock chart. */
export const SixtyfoldStockChart = forwardRef<StockChartHandle, SixtyfoldStockChartProps>(
  function SixtyfoldStockChart(
    {
      options,
      data,
      appearance,
      viewport,
      viewportAnimated,
      onReady,
      onError,
      onStats,
      statsIntervalMs,
      style,
      ...canvasProps
    },
    forwardedRef,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<StockChart | null>(null);
    const initialOptionsRef = useRef(options);
    const latestRef = useRef({
      data,
      appearance,
      viewport,
      viewportAnimated,
      onReady,
      onError,
      onStats,
      statsIntervalMs,
    });
    const readyRef = useRef(false);
    const appliedDataRef = useRef<OHLCVData | undefined>(undefined);
    const appliedAppearanceRef = useRef<DeepPartial<StockAppearanceOptions> | undefined>(undefined);
    const appliedViewportRef = useRef<Partial<Viewport> | undefined>(undefined);

    useImperativeHandle(
      forwardedRef,
      () => ({
        get chart() {
          return chartRef.current;
        },
      }),
      [],
    );

    // Publish only committed props. Mutating this ref during render can expose
    // values from a concurrent render that React later abandons.
    useEffect(() => {
      latestRef.current = {
        data,
        appearance,
        viewport,
        viewportAnimated,
        onReady,
        onError,
        onStats,
        statsIntervalMs,
      };
    }, [appearance, data, onError, onReady, onStats, statsIntervalMs, viewport, viewportAnimated]);

    // Installs every reactive prop in a single engine update. Each dataset
    // object is applied at most once and never before the chart is ready.
    // Worker mode transfers its buffers; identity tracking also prevents
    // duplicate installs in main-thread mode.
    const applyReactiveProps = useCallback((): void => {
      const chart = chartRef.current;
      if (!readyRef.current || !chart) return;
      const current = latestRef.current;
      chart.batch(() => {
        if (current.data && current.data !== appliedDataRef.current) {
          chart.setData(current.data);
          appliedDataRef.current = current.data;
        }
        if (current.appearance && current.appearance !== appliedAppearanceRef.current) {
          chart.updateAppearance(current.appearance);
          appliedAppearanceRef.current = current.appearance;
        }
        if (hasViewport(current.viewport) && current.viewport !== appliedViewportRef.current) {
          chart.setViewport(current.viewport, { animated: current.viewportAnimated });
          appliedViewportRef.current = current.viewport;
        }
      });
    }, []);

    useEffect(() => {
      let disposed = false;
      let mountedChart: StockChart | null = null;
      queueMicrotask(() => {
        if (disposed || !canvasRef.current) return;
        let chart: StockChart;
        try {
          chart = new StockChart(canvasRef.current, initialOptionsRef.current ?? {});
        } catch (error) {
          // Construction is deferred into a microtask, so a throw here would
          // otherwise escape as an uncaught error no error boundary can see.
          if (!disposed) latestRef.current.onError?.(error);
          return;
        }
        mountedChart = chart;
        chartRef.current = chart;
        let reportedRendererError: unknown;
        chart.setRendererErrorCallback((error) => {
          reportedRendererError = error;
          if (!disposed) latestRef.current.onError?.(error);
        });
        chart.setOverlayErrorCallback((error) => {
          if (!disposed) latestRef.current.onError?.(error);
        });
        const latest = latestRef.current;
        chart.setStatsCallback(
          latest.onStats ? (stats) => latestRef.current.onStats?.(stats) : null,
          { intervalMs: latest.statsIntervalMs },
        );
        void chart
          .initialize()
          .then(() => {
            if (disposed || chartRef.current !== chart) return;
            readyRef.current = true;
            applyReactiveProps();
            latestRef.current.onReady?.(chart);
          })
          .catch((error) => {
            if (!disposed && error !== reportedRendererError) {
              latestRef.current.onError?.(error);
            }
          });
      });
      return () => {
        disposed = true;
        readyRef.current = false;
        if (chartRef.current === mountedChart) chartRef.current = null;
        mountedChart?.destroy();
      };
    }, [applyReactiveProps]);

    useEffect(() => {
      applyReactiveProps();
    }, [applyReactiveProps, data, appearance, viewport, viewportAnimated]);

    useEffect(() => {
      const chart = chartRef.current;
      if (!chart) return;
      chart.setStatsCallback(onStats ? (stats) => latestRef.current.onStats?.(stats) : null, {
        intervalMs: statsIntervalMs,
      });
    }, [onStats, statsIntervalMs]);

    return (
      <canvas
        aria-label={options?.interactive === false ? "Stock chart" : "Interactive stock chart"}
        role={options?.interactive === false ? "img" : "application"}
        tabIndex={options?.interactive === false ? undefined : 0}
        {...canvasProps}
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", ...style }}
      />
    );
  },
);
