// Shared time-series data shapes used across chart packages.
// (Data *generation* lives in the demo app; these are the wire types.)

export interface TimeSeriesData {
  x: Float64Array; // Unix timestamps
  y: Float64Array; // Values
  length: number;
}

export interface RangeSeriesData {
  low: Float64Array; // Lower band boundary
  high: Float64Array; // Upper band boundary
  y?: Float64Array; // Optional center line; midpoint is used when omitted
}

export type LineSeriesData = Float64Array | RangeSeriesData;

export interface MultiSeriesData {
  x: Float64Array; // Shared X axis (timestamps)
  series: LineSeriesData[]; // Y values or low/high bands for each series
  length: number;
  seriesCount: number;
}
