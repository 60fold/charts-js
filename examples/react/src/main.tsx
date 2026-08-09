import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SixtyfoldLineChart } from "@sixtyfold/react/line";
import { SixtyfoldStockChart } from "@sixtyfold/react/stock";
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
      <h1>React / Sixtyfold</h1>
      <p>Two deterministic million-point workloads rendered through transferable typed arrays.</p>
      <div className="grid">
        <section className="panel">
          <header className="panel-heading">
            <div>
              <span>AI inference observability</span>
              <h2>Line</h2>
            </div>
            <strong data-workload={LINE_VALUE_COUNT}>{LINE_WORKLOAD_LABEL}</strong>
          </header>
          <SixtyfoldLineChart
            className="chart"
            data={lineData}
            onReady={markChartReady}
            options={lineOptions}
          />
        </section>
        <section className="panel">
          <header className="panel-heading">
            <div>
              <span>Synthetic market history</span>
              <h2>Stock</h2>
            </div>
            <strong data-workload={STOCK_VALUE_COUNT}>{STOCK_WORKLOAD_LABEL}</strong>
          </header>
          <SixtyfoldStockChart
            className="chart"
            data={stockData}
            onReady={markChartReady}
            options={stockOptions}
          />
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
