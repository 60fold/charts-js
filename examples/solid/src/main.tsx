import { render } from "solid-js/web";
import { SixtyfoldLineChart } from "@sixtyfold/solid/line";
import { SixtyfoldStockChart } from "@sixtyfold/solid/stock";
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
import "../../shared/styles.css";

const lineData = createInferenceLatencyData();
const stockData = createSyntheticMarketData();
const lineOptions = createLineOptions();
const stockOptions = createStockOptions(stockData);

function App() {
  return (
    <main>
      <h1>Solid / Sixtyfold</h1>
      <p>Two deterministic million-point workloads rendered through transferable typed arrays.</p>
      <div class="grid">
        <section class="panel">
          <header class="panel-heading">
            <div>
              <span>AI inference observability</span>
              <h2>Line</h2>
            </div>
            <strong data-workload={LINE_VALUE_COUNT}>{LINE_WORKLOAD_LABEL}</strong>
          </header>
          <SixtyfoldLineChart
            canvasProps={{ class: "chart" }}
            data={lineData}
            onReady={markChartReady}
            options={lineOptions}
          />
        </section>
        <section class="panel">
          <header class="panel-heading">
            <div>
              <span>Synthetic market history</span>
              <h2>Stock</h2>
            </div>
            <strong data-workload={STOCK_VALUE_COUNT}>{STOCK_WORKLOAD_LABEL}</strong>
          </header>
          <SixtyfoldStockChart
            canvasProps={{ class: "chart" }}
            data={stockData}
            onReady={markChartReady}
            options={stockOptions}
          />
        </section>
      </div>
    </main>
  );
}

render(() => <App />, document.getElementById("root")!);
