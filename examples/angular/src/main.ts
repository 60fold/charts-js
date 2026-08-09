import { Component, provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { SixtyfoldLineChartComponent } from "@sixtyfold/angular/line";
import { SixtyfoldStockChartComponent } from "@sixtyfold/angular/stock";
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

@Component({
  selector: "app-root",
  standalone: true,
  imports: [SixtyfoldLineChartComponent, SixtyfoldStockChartComponent],
  template: `<main>
    <h1>Angular / Sixtyfold</h1>
    <p>Two deterministic million-point workloads rendered through transferable typed arrays.</p>
    <div class="grid">
      <section class="panel">
        <header class="panel-heading">
          <div>
            <span>AI inference observability</span>
            <h2>Line</h2>
          </div>
          <strong [attr.data-workload]="lineValueCount">{{ lineWorkloadLabel }}</strong>
        </header>
        <sixtyfold-line-chart
          class="chart"
          [data]="lineData"
          [options]="lineOptions"
          (chartReady)="markReady()"
        />
      </section>
      <section class="panel">
        <header class="panel-heading">
          <div>
            <span>Synthetic market history</span>
            <h2>Stock</h2>
          </div>
          <strong [attr.data-workload]="stockValueCount">{{ stockWorkloadLabel }}</strong>
        </header>
        <sixtyfold-stock-chart
          class="chart"
          [data]="stockData"
          [options]="stockOptions"
          (chartReady)="markReady()"
        />
      </section>
    </div>
  </main>`,
})
class App {
  readonly lineData = createInferenceLatencyData();
  readonly stockData = createSyntheticMarketData();
  readonly lineOptions = createLineOptions();
  readonly stockOptions = createStockOptions(this.stockData);
  readonly lineValueCount = LINE_VALUE_COUNT;
  readonly stockValueCount = STOCK_VALUE_COUNT;
  readonly lineWorkloadLabel = LINE_WORKLOAD_LABEL;
  readonly stockWorkloadLabel = STOCK_WORKLOAD_LABEL;
  readonly markReady = markChartReady;
}

void bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] });
