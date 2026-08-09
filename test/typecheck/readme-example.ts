import { LineChart } from "@sixtyfold/line";
import * as mcp from "@sixtyfold/mcp";
import type { LineChartEngine } from "@sixtyfold/line/engine";
import type { StockChartEngine } from "@sixtyfold/stock/engine";

type HasPublicStateAccessor<T> = "getState" extends keyof T ? true : false;
const lineEngineLeaksState: HasPublicStateAccessor<LineChartEngine> = false;
const stockEngineLeaksState: HasPublicStateAccessor<StockChartEngine> = false;
type McpRootExposesSdkServer = "createSixtyfoldMcpServer" extends keyof typeof mcp ? true : false;
const mcpRootExposesSdkServer: McpRootExposesSdkServer = false;

declare const lineChart: LineChart;
const optionsSnapshot = lineChart.getOptions();
if (optionsSnapshot.labels?.top) {
  // @ts-expect-error getOptions returns a recursively read-only snapshot.
  optionsSnapshot.labels.top.text = "Mutated";
}
const appearanceSnapshot = lineChart.getAppearance();
if (appearanceSnapshot.grid) {
  // @ts-expect-error getAppearance returns a recursively read-only snapshot.
  appearanceSnapshot.grid.color = "#000";
}

async function renderReadmeExample(canvas: HTMLCanvasElement): Promise<void> {
  const chart = new LineChart(canvas, {
    renderMode: "worker",
    series: [{ name: "Signal" }],
  });

  await chart.initialize();
  chart.setMultiSeriesData({
    x: new Float64Array([0, 1, 2, 3]),
    series: [new Float64Array([4, 8, 6, 12])],
    length: 4,
    seriesCount: 1,
  });
}

void renderReadmeExample;
void lineEngineLeaksState;
void stockEngineLeaksState;
void mcpRootExposesSdkServer;
