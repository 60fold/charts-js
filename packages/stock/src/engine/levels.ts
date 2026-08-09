export interface AggregatedLevel {
  name: string;
  interval: number;
  timestamp: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
  /** Timestamp of the final valid raw candle represented by each bucket. */
  sourceEndTimestamp?: Float64Array;
  /** Gap-compressed X coordinate for market-time rendering. */
  marketX?: Float64Array;
  length: number;
  rawSource?: boolean;
}

export interface StockLevelDataSource {
  logicalToPhysicalIndex(index: number): number;
  getRawMarketX(index: number): number;
  usesMarketTime(): boolean;
}

export class StockLevelAccess {
  declare private readonly data: StockLevelDataSource;

  constructor(data: StockLevelDataSource) {
    this.data = data;
  }

  arrayIndex(level: AggregatedLevel, index: number): number {
    return level.rawSource ? this.data.logicalToPhysicalIndex(index) : index;
  }

  getTimestamp(level: AggregatedLevel, index: number): number {
    return level.timestamp[this.arrayIndex(level, index)];
  }

  getX(level: AggregatedLevel, index: number): number {
    if (!this.data.usesMarketTime()) {
      return this.getTimestamp(level, index);
    }
    if (level.rawSource) return this.data.getRawMarketX(index);
    return level.marketX?.[index] ?? this.getTimestamp(level, index);
  }

  getOpen(level: AggregatedLevel, index: number): number {
    return level.open[this.arrayIndex(level, index)];
  }

  getHigh(level: AggregatedLevel, index: number): number {
    return level.high[this.arrayIndex(level, index)];
  }

  getLow(level: AggregatedLevel, index: number): number {
    return level.low[this.arrayIndex(level, index)];
  }

  getClose(level: AggregatedLevel, index: number): number {
    return level.close[this.arrayIndex(level, index)];
  }

  getVolume(level: AggregatedLevel, index: number): number {
    return level.volume[this.arrayIndex(level, index)];
  }

  getSourceEndTimestamp(level: AggregatedLevel, index: number): number {
    if (level.rawSource || !level.sourceEndTimestamp) {
      return this.getTimestamp(level, index);
    }
    return level.sourceEndTimestamp[index];
  }

  binarySearchLeft(
    level: AggregatedLevel,
    target: number,
    start = 0,
    end = level.length - 1,
  ): number {
    let low = start;
    let high = end;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.getX(level, middle) < target) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  binarySearchRight(
    level: AggregatedLevel,
    target: number,
    start = 0,
    end = level.length - 1,
  ): number {
    let low = start;
    let high = end;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.getX(level, middle) <= target) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  binarySearchTimestampLeft(
    level: AggregatedLevel,
    target: number,
    start = 0,
    end = level.length - 1,
  ): number {
    let low = start;
    let high = end;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.getTimestamp(level, middle) < target) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }
}
