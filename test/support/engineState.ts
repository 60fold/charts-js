import type { WorkerState } from "@sixtyfold/core/internal/renderer";
import type { LineChartEngine } from "../../packages/line/src/lineRenderer.js";
import type { StockChartEngine } from "../../packages/stock/src/stockRenderer.js";

const lineStateKey = Symbol.for("sixtyfold:test:line-engine-state");
const stockStateKey = Symbol.for("sixtyfold:test:stock-engine-state");

export function getLineEngineState(engine: LineChartEngine): WorkerState {
  return readEngineState(engine, lineStateKey);
}

export function getStockEngineState(engine: StockChartEngine): WorkerState {
  return readEngineState(engine, stockStateKey);
}

function readEngineState(engine: object, key: symbol): WorkerState {
  const state = (engine as Record<symbol, WorkerState | undefined>)[key];
  if (!state) throw new Error("Renderer test state is unavailable.");
  return state;
}
