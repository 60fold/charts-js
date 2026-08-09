<script setup lang="ts">
import { shallowRef } from "vue";
import { SixtyfoldLineChart } from "@sixtyfold/vue/line";
import { SixtyfoldStockChart } from "@sixtyfold/vue/stock";
import {
  createInferenceLatencyData,
  createLineOptions,
  createStockOptions,
  createSyntheticMarketData,
  LINE_VALUE_COUNT,
  LINE_WORKLOAD_LABEL,
  markChartReady,
  STOCK_VALUE_COUNT,
  STOCK_WORKLOAD_LABEL,
} from "../../shared/data";

const lineData = shallowRef(createInferenceLatencyData());
const stockData = shallowRef(createSyntheticMarketData());
const lineOptions = createLineOptions();
const stockOptions = createStockOptions(stockData.value);
</script>

<template>
  <main>
    <h1>Vue / Sixtyfold</h1>
    <p>Two deterministic million-point workloads rendered through transferable typed arrays.</p>
    <div class="grid">
      <section class="panel">
        <header class="panel-heading">
          <div>
            <span>AI inference observability</span>
            <h2>Line</h2>
          </div>
          <strong :data-workload="LINE_VALUE_COUNT">{{ LINE_WORKLOAD_LABEL }}</strong>
        </header>
        <SixtyfoldLineChart
          class="chart"
          :data="lineData"
          :options="lineOptions"
          @ready="markChartReady"
        />
      </section>
      <section class="panel">
        <header class="panel-heading">
          <div>
            <span>Synthetic market history</span>
            <h2>Stock</h2>
          </div>
          <strong :data-workload="STOCK_VALUE_COUNT">{{ STOCK_WORKLOAD_LABEL }}</strong>
        </header>
        <SixtyfoldStockChart
          class="chart"
          :data="stockData"
          :options="stockOptions"
          @ready="markChartReady"
        />
      </section>
    </div>
  </main>
</template>
