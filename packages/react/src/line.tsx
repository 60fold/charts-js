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
  LineChart,
  type LineAppearanceOptions,
  type LineChartOptions,
  type LineChartStats,
  type LineDataUpdateOptions,
  type SeriesVisibilityChangeEvent,
} from "@sixtyfold/line";
import { hasViewport, installLineData, type ChartHandle, type LineData } from "./shared.js";

export type LineChartHandle = ChartHandle<LineChart>;

export interface SixtyfoldLineChartProps extends Omit<
  CanvasHTMLAttributes<HTMLCanvasElement>,
  "children"
> {
  /** Construction-time options. Remount the component to replace them. */
  options?: LineChartOptions;
  /**
   * One-shot chart data. Supply a new object for each update. Worker mode
   * transfers and detaches its buffers; main-thread mode retains references.
   */
  data?: LineData;
  dataUpdateOptions?: LineDataUpdateOptions;
  /** Reactive visual patch applied without recreating the chart. */
  appearance?: DeepPartial<LineAppearanceOptions>;
  /** Reactive viewport patch. */
  viewport?: Partial<Viewport>;
  /** Leave undefined to inherit the chart's configured `animated` default. */
  viewportAnimated?: boolean;
  onReady?: (chart: LineChart) => void;
  /** Reports construction, renderer, and overlay-image failures. */
  onError?: (error: unknown) => void;
  onStats?: (stats: LineChartStats) => void;
  statsIntervalMs?: number;
  onSeriesVisibilityChange?: (event: SeriesVisibilityChangeEvent) => void;
}

/** React host for a Sixtyfold line chart. DOM work starts after mount, so SSR emits only the canvas. */
export const SixtyfoldLineChart = forwardRef<LineChartHandle, SixtyfoldLineChartProps>(
  function SixtyfoldLineChart(
    {
      options,
      data,
      dataUpdateOptions,
      appearance,
      viewport,
      viewportAnimated,
      onReady,
      onError,
      onStats,
      statsIntervalMs,
      onSeriesVisibilityChange,
      style,
      ...canvasProps
    },
    forwardedRef,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<LineChart | null>(null);
    const initialOptionsRef = useRef(options);
    const latestRef = useRef({
      data,
      dataUpdateOptions,
      appearance,
      viewport,
      viewportAnimated,
      onReady,
      onError,
      onStats,
      statsIntervalMs,
      onSeriesVisibilityChange,
    });
    const readyRef = useRef(false);
    const appliedDataRef = useRef<LineData | undefined>(undefined);
    const appliedAppearanceRef = useRef<DeepPartial<LineAppearanceOptions> | undefined>(undefined);
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
        dataUpdateOptions,
        appearance,
        viewport,
        viewportAnimated,
        onReady,
        onError,
        onStats,
        statsIntervalMs,
        onSeriesVisibilityChange,
      };
    }, [
      appearance,
      data,
      dataUpdateOptions,
      onError,
      onReady,
      onSeriesVisibilityChange,
      onStats,
      statsIntervalMs,
      viewport,
      viewportAnimated,
    ]);

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
          installLineData(chart, current.data, current.dataUpdateOptions);
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
      let mountedChart: LineChart | null = null;

      // Deferring construction by one microtask prevents React Strict Mode's
      // development-only setup/cleanup probe from installing data twice.
      queueMicrotask(() => {
        if (disposed || !canvasRef.current) return;
        let chart: LineChart;
        try {
          chart = new LineChart(canvasRef.current, initialOptionsRef.current ?? {});
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
        chart.setSeriesVisibilityCallback((event) => {
          latestRef.current.onSeriesVisibilityChange?.(event);
        });

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
    }, [applyReactiveProps, data, dataUpdateOptions, appearance, viewport, viewportAnimated]);

    useEffect(() => {
      const chart = chartRef.current;
      if (!chart) return;
      chart.setStatsCallback(onStats ? (stats) => latestRef.current.onStats?.(stats) : null, {
        intervalMs: statsIntervalMs,
      });
    }, [onStats, statsIntervalMs]);

    return (
      <canvas
        aria-label={options?.interactive === false ? "Chart" : "Interactive chart"}
        role={options?.interactive === false ? "img" : "application"}
        tabIndex={options?.interactive === false ? undefined : 0}
        {...canvasProps}
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", ...style }}
      />
    );
  },
);
