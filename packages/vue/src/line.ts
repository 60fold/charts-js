import {
  defineComponent,
  getCurrentInstance,
  h,
  mergeProps,
  onMounted,
  onUnmounted,
  onUpdated,
  shallowRef,
  watch,
  type CSSProperties,
  type PropType,
} from "vue";
import type { DeepPartial, Viewport } from "@sixtyfold/core";
import {
  LineChart,
  type LineAppearanceOptions,
  type LineChartOptions,
  type LineChartStats,
  type LineDataUpdateOptions,
  type SeriesVisibilityChangeEvent,
} from "@sixtyfold/line";
import { hasViewport, installLineData, type LineData } from "./shared.js";

/** Vue host for a Sixtyfold line chart. The component is SSR-safe and emits the underlying chart on readiness. */
export const SixtyfoldLineChart = defineComponent({
  name: "SixtyfoldLineChart",
  inheritAttrs: false,
  props: {
    options: Object as PropType<LineChartOptions>,
    data: Object as PropType<LineData>,
    dataUpdateOptions: Object as PropType<LineDataUpdateOptions>,
    appearance: Object as PropType<DeepPartial<LineAppearanceOptions>>,
    viewport: Object as PropType<Partial<Viewport>>,
    /** Leave undefined to inherit the chart's configured `animated` default. */
    viewportAnimated: { type: Boolean, default: undefined },
    statsIntervalMs: Number,
  },
  emits: {
    ready: (_chart: LineChart) => true,
    error: (_error: unknown) => true,
    stats: (_stats: LineChartStats) => true,
    seriesVisibilityChange: (_event: SeriesVisibilityChangeEvent) => true,
  },
  setup(props, { attrs, emit, expose }) {
    const canvas = shallowRef<HTMLCanvasElement | null>(null);
    const chart = shallowRef<LineChart | null>(null);
    const vm = getCurrentInstance();
    let ready = false;
    let disposed = false;
    let appliedData: LineData | undefined;
    let appliedAppearance: DeepPartial<LineAppearanceOptions> | undefined;
    let appliedViewport: Partial<Viewport> | undefined;
    let statsEnabled: boolean | undefined;
    let statsInterval: number | undefined;
    let reportedRendererError: unknown;

    expose({ chart });

    // Declared emits are stripped from `attrs`, so the raw vnode props are the
    // only place a bound `stats` listener is visible. Collecting stats costs
    // renderer work, so it stays off until something is actually listening.
    const hasStatsListener = (): boolean => Boolean(vm?.vnode.props?.onStats);

    const syncStatsCallback = (): void => {
      const instance = chart.value;
      if (!instance) return;
      const enabled = hasStatsListener();
      if (enabled === statsEnabled && props.statsIntervalMs === statsInterval) return;
      statsEnabled = enabled;
      statsInterval = props.statsIntervalMs;
      instance.setStatsCallback(enabled ? (stats) => emit("stats", stats) : null, {
        intervalMs: props.statsIntervalMs,
      });
    };

    // Installs every reactive prop in a single engine update. Each dataset
    // object is applied at most once. Worker mode transfers its buffers;
    // identity tracking also prevents duplicate installs in main-thread mode.
    const applyReactiveProps = (): void => {
      const instance = chart.value;
      if (!ready || !instance) return;
      instance.batch(() => {
        if (props.data && props.data !== appliedData) {
          installLineData(instance, props.data, props.dataUpdateOptions);
          appliedData = props.data;
        }
        if (props.appearance && props.appearance !== appliedAppearance) {
          instance.updateAppearance(props.appearance);
          appliedAppearance = props.appearance;
        }
        if (hasViewport(props.viewport) && props.viewport !== appliedViewport) {
          instance.setViewport(props.viewport, { animated: props.viewportAnimated });
          appliedViewport = props.viewport;
        }
      });
    };

    onMounted(() => {
      if (!canvas.value) return;
      let instance: LineChart;
      try {
        instance = new LineChart(canvas.value, props.options ?? {});
      } catch (error) {
        if (!disposed) emit("error", error);
        return;
      }
      chart.value = instance;
      instance.setRendererErrorCallback((error) => {
        reportedRendererError = error;
        if (!disposed) emit("error", error);
      });
      instance.setOverlayErrorCallback((error) => {
        if (!disposed) emit("error", error);
      });
      syncStatsCallback();
      instance.setSeriesVisibilityCallback((event) => emit("seriesVisibilityChange", event));
      void instance
        .initialize()
        .then(() => {
          if (disposed || chart.value !== instance) return;
          ready = true;
          applyReactiveProps();
          emit("ready", instance);
        })
        .catch((error) => {
          if (!disposed && error !== reportedRendererError) emit("error", error);
        });
    });

    watch(
      () => [props.data, props.appearance, props.viewport, props.viewportAnimated] as const,
      () => applyReactiveProps(),
    );
    watch(
      () => props.statsIntervalMs,
      () => syncStatsCallback(),
    );
    // A listener can be bound or removed without any tracked prop changing.
    onUpdated(() => syncStatsCallback());

    onUnmounted(() => {
      disposed = true;
      ready = false;
      chart.value?.destroy();
      chart.value = null;
    });

    return () =>
      h(
        "canvas",
        mergeProps(
          {
            "aria-label": props.options?.interactive === false ? "Chart" : "Interactive chart",
            role: props.options?.interactive === false ? "img" : "application",
            tabindex: props.options?.interactive === false ? undefined : 0,
          },
          attrs,
          {
            ref: canvas,
            style: [
              { display: "block", width: "100%", height: "100%" } satisfies CSSProperties,
              attrs.style,
            ],
          },
        ),
      );
  },
});
