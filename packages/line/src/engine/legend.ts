import {
  applyCanvasTextDirection,
  drawMarker,
  isRtlTextDirection,
  resolveCanvasTextAlign,
  type RenderContext2D,
  type ResolvedTextDirection,
  type WorkerState,
} from "@sixtyfold/core/internal/renderer";
import { DEFAULT_CHART_FONT_FAMILY } from "@sixtyfold/core/chart/chartConstants";
import { clampLegendOffset } from "./lineMath.js";
import { parseLegendSwatchShape, type LegendSwatchShape } from "./lineOptions.js";

type LegendPosition = "left" | "top" | "right" | "bottom";
type LegendLayout = "row" | "column";
type LegendAlign = "left" | "center" | "right" | "middle";
type VisibilitySource = "api" | "legend";

interface LegendPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface LegendHitbox {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LegendMeasuredItem {
  index: number;
  label: string;
  color: string;
  direction: ResolvedTextDirection;
  textWidth: number;
  textRenderWidth: number;
  width: number;
  height: number;
}

export interface LegendLayoutItem extends LegendMeasuredItem {
  x: number;
  y: number;
  swatchCenterX: number;
  swatchCenterY: number;
  textX: number;
  textY: number;
  textAlign: CanvasTextAlign;
}

interface LegendRow {
  items: LegendMeasuredItem[];
  width: number;
  height: number;
}

interface LegendReserveSnapshot {
  measurementRevision: number;
  width: number;
  layout: LegendLayout;
  position: LegendPosition;
  itemGap: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  basePaddingLeft: number;
  basePaddingRight: number;
  labelLeftSpace: number;
  labelRightSpace: number;
  leftAxisTickLength: number;
  rightAxisTickLength: number;
}

interface LegendLayoutSnapshot {
  measurementRevision: number;
  reserveSize: number;
  position: LegendPosition;
  layout: LegendLayout;
  align: LegendAlign;
  itemGap: number;
  width: number;
  height: number;
  chartTop: number;
  chartHeight: number;
  chartWidth: number;
  paddingLeft: number;
  paddingRight: number;
  showRangeSelector: boolean;
  rangeSelectorPosition: "top" | "bottom";
  rangeSelectorHeight: number;
  rangeSelectorGap: number;
  legendPaddingTop: number;
  legendPaddingRight: number;
  legendPaddingBottom: number;
  legendPaddingLeft: number;
}

interface LayoutSnapshot {
  width: number;
  height: number;
  chartTop: number;
  chartHeight: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  xAxisHeight: number;
  legendInteractive: boolean;
  legendLayoutRevision: number;
}

export interface LegendCallbacks {
  getSeriesCount(): number;
  getSeriesName(index: number): string;
  getSeriesColor(index: number): string;
  isSeriesVisible(index: number): boolean;
  setSeriesVisibility(index: number, visible: boolean, source: VisibilitySource): boolean;
  postMessage(message: Record<string, unknown>): void;
}

const DEFAULT_PADDING: LegendPadding = {
  top: 8,
  right: 8,
  bottom: 8,
  left: 8,
};
const DEFAULT_SWATCH_SIZE = 10;
const DEFAULT_SWATCH_GAP = 6;
const DEFAULT_SWATCH_BORDER_COLOR = "rgba(255,255,255,0)";
const DEFAULT_SWATCH_BORDER_WIDTH = 0;
const DEFAULT_ITEM_GAP = 12;
const DEFAULT_FONT_SIZE = 12;
const DEFAULT_FONT_WEIGHT: string | number = "normal";
const DEFAULT_FONT_STYLE: "normal" | "italic" | "oblique" = "normal";
const DEFAULT_FONT_COLOR = "#cfd6e6";
const DEFAULT_INACTIVE_OPACITY = 0.45;

export class LegendRuntime {
  declare visible: boolean;
  declare position: LegendPosition;
  declare layout: LegendLayout;
  declare align: LegendAlign;
  declare interactive: boolean;
  declare allowHideAll: boolean;

  declare private readonly state: WorkerState;
  declare private readonly callbacks: LegendCallbacks;
  declare private swatchShape: LegendSwatchShape;
  declare private swatchSize: number;
  declare private swatchGap: number;
  declare private swatchBorderColor: string;
  declare private swatchBorderWidth: number;
  declare private itemGap: number;
  declare private labelFontSize: number;
  declare private labelFontWeight: string | number;
  declare private labelFontStyle: "normal" | "italic" | "oblique";
  declare private labelFontColor: string;
  declare private labelFontFamily: string;
  declare private labelMaxWidth: number | null;
  declare private padding: LegendPadding;
  declare private inactiveOpacity: number;
  declare private hitboxes: LegendHitbox[];
  declare private bottomReserve: number;
  declare private inputRevision: number;
  declare private measurementInputRevision: number;
  declare private measurementSeriesCount: number;
  declare private measurementTextDirection: string;
  declare private measurementRevision: number;
  declare private measuredItemsCache: LegendMeasuredItem[];
  declare private reserveCacheValue: number;
  declare private layoutRevision: number;
  declare private layoutItemsCache: LegendLayoutItem[];
  declare private reserveSnapshot: LegendReserveSnapshot | null;
  declare private layoutSnapshot: LegendLayoutSnapshot | null;
  declare private lastLayoutSnapshot: LayoutSnapshot | null;

  constructor(state: WorkerState, callbacks: LegendCallbacks) {
    this.state = state;
    this.callbacks = callbacks;
    this.visible = false;
    this.position = "right";
    this.layout = "column";
    this.align = "center";
    this.interactive = false;
    this.allowHideAll = false;
    this.swatchShape = "circle";
    this.swatchSize = DEFAULT_SWATCH_SIZE;
    this.swatchGap = DEFAULT_SWATCH_GAP;
    this.swatchBorderColor = DEFAULT_SWATCH_BORDER_COLOR;
    this.swatchBorderWidth = DEFAULT_SWATCH_BORDER_WIDTH;
    this.itemGap = DEFAULT_ITEM_GAP;
    this.labelFontSize = DEFAULT_FONT_SIZE;
    this.labelFontWeight = DEFAULT_FONT_WEIGHT;
    this.labelFontStyle = DEFAULT_FONT_STYLE;
    this.labelFontColor = DEFAULT_FONT_COLOR;
    this.labelFontFamily = DEFAULT_CHART_FONT_FAMILY;
    this.labelMaxWidth = null;
    this.padding = { ...DEFAULT_PADDING };
    this.inactiveOpacity = DEFAULT_INACTIVE_OPACITY;
    this.hitboxes = [];
    this.bottomReserve = 0;
    this.inputRevision = 0;
    this.measurementInputRevision = -1;
    this.measurementSeriesCount = -1;
    this.measurementTextDirection = "";
    this.measurementRevision = 0;
    this.measuredItemsCache = [];
    this.reserveCacheValue = 0;
    this.layoutRevision = 0;
    this.layoutItemsCache = [];
    this.reserveSnapshot = null;
    this.layoutSnapshot = null;
    this.lastLayoutSnapshot = null;
  }

  invalidateMeasurements(): void {
    this.inputRevision++;
  }

  parseConfig(config: Record<string, any>): void {
    this.invalidateMeasurements();
    this.visible = false;
    this.position = "right";
    this.layout = "column";
    this.align = "center";
    this.interactive = false;
    this.allowHideAll = false;
    this.swatchShape = "circle";
    this.swatchSize = DEFAULT_SWATCH_SIZE;
    this.swatchGap = DEFAULT_SWATCH_GAP;
    this.swatchBorderColor = DEFAULT_SWATCH_BORDER_COLOR;
    this.swatchBorderWidth = DEFAULT_SWATCH_BORDER_WIDTH;
    this.itemGap = DEFAULT_ITEM_GAP;
    this.labelFontSize = DEFAULT_FONT_SIZE;
    this.labelFontWeight = DEFAULT_FONT_WEIGHT;
    this.labelFontStyle = DEFAULT_FONT_STYLE;
    this.labelFontColor = DEFAULT_FONT_COLOR;
    this.labelFontFamily = DEFAULT_CHART_FONT_FAMILY;
    this.labelMaxWidth = null;
    this.padding = { ...DEFAULT_PADDING };
    this.inactiveOpacity = DEFAULT_INACTIVE_OPACITY;
    this.hitboxes = [];

    const legend = config.legend;
    if (!legend) return;

    this.visible = legend.visible ?? true;
    if (
      legend.position === "left" ||
      legend.position === "top" ||
      legend.position === "right" ||
      legend.position === "bottom"
    ) {
      this.position = legend.position;
    }
    if (legend.layout === "row" || legend.layout === "column") {
      this.layout = legend.layout;
    }
    if (
      legend.align === "left" ||
      legend.align === "center" ||
      legend.align === "right" ||
      legend.align === "middle"
    ) {
      this.align = legend.align;
    }
    this.interactive = !!legend.interactive;
    this.allowHideAll = !!legend.allowHideAll;
    this.applyNumericSettings(legend);
    this.applyLabelFont(legend.labelFont);
    this.applyPadding(legend.padding);
    this.applySwatch(legend.swatch);
  }

  patchConfig(legend: Record<string, any>): void {
    this.invalidateMeasurements();
    if (legend.visible !== undefined) this.visible = !!legend.visible;
    if (
      legend.position === "left" ||
      legend.position === "top" ||
      legend.position === "right" ||
      legend.position === "bottom"
    ) {
      this.position = legend.position;
    }
    if (legend.layout === "row" || legend.layout === "column") {
      this.layout = legend.layout;
    }
    if (
      legend.align === "left" ||
      legend.align === "center" ||
      legend.align === "right" ||
      legend.align === "middle"
    ) {
      this.align = legend.align;
    }
    if (legend.interactive !== undefined) {
      this.interactive = !!legend.interactive;
    }
    if (legend.allowHideAll !== undefined) {
      this.allowHideAll = !!legend.allowHideAll;
    }
    this.applyNumericSettings(legend);
    this.applyLabelFont(legend.labelFont);
    this.applyPadding(legend.padding);
    this.applySwatch(legend.swatch);
  }

  private applyNumericSettings(legend: Record<string, any>): void {
    if (Number.isFinite(legend.itemGap) && legend.itemGap >= 0) {
      this.itemGap = legend.itemGap;
    }
    if (Number.isFinite(legend.swatchGap) && legend.swatchGap >= 0) {
      this.swatchGap = legend.swatchGap;
    }
    if (Number.isFinite(legend.inactiveOpacity)) {
      this.inactiveOpacity = Math.max(0, Math.min(1, legend.inactiveOpacity));
    }
  }

  private applyLabelFont(labelFont: Record<string, any> | undefined): void {
    if (!labelFont) return;
    if (Number.isFinite(labelFont.size) && labelFont.size > 0) {
      this.labelFontSize = labelFont.size;
    }
    if (labelFont.weight !== undefined) {
      this.labelFontWeight = labelFont.weight;
    }
    if (
      labelFont.style === "normal" ||
      labelFont.style === "italic" ||
      labelFont.style === "oblique"
    ) {
      this.labelFontStyle = labelFont.style;
    }
    if (labelFont.color) this.labelFontColor = labelFont.color;
    if (labelFont.family) this.labelFontFamily = labelFont.family;
    if (Number.isFinite(labelFont.width) && labelFont.width >= 0) {
      this.labelMaxWidth = labelFont.width;
    }
  }

  private applyPadding(padding: Record<string, any> | undefined): void {
    if (!padding) return;
    if (Number.isFinite(padding.top) && padding.top >= 0) {
      this.padding.top = padding.top;
    }
    if (Number.isFinite(padding.right) && padding.right >= 0) {
      this.padding.right = padding.right;
    }
    if (Number.isFinite(padding.bottom) && padding.bottom >= 0) {
      this.padding.bottom = padding.bottom;
    }
    if (Number.isFinite(padding.left) && padding.left >= 0) {
      this.padding.left = padding.left;
    }
  }

  private applySwatch(swatch: Record<string, any> | undefined): void {
    if (!swatch) return;
    const shape = parseLegendSwatchShape(swatch.shape);
    if (shape) this.swatchShape = shape;
    if (Number.isFinite(swatch.size) && swatch.size > 0) {
      this.swatchSize = swatch.size;
    }
    if (swatch.borderColor) this.swatchBorderColor = swatch.borderColor;
    if (Number.isFinite(swatch.borderWidth) && swatch.borderWidth >= 0) {
      this.swatchBorderWidth = swatch.borderWidth;
    }
  }

  private getFont(): string {
    return `${this.labelFontStyle} ${this.labelFontWeight} ${this.labelFontSize}px ${this.labelFontFamily}`;
  }

  private measureItems(context: RenderContext2D): LegendMeasuredItem[] {
    const seriesCount = this.callbacks.getSeriesCount();
    if (!this.visible || seriesCount === 0) return [];

    context.save();
    context.font = this.getFont();
    const measured: LegendMeasuredItem[] = [];
    for (let index = 0; index < seriesCount; index++) {
      const label = this.callbacks.getSeriesName(index);
      const direction = applyCanvasTextDirection(context, this.state, label);
      const textWidth = Math.ceil(Math.max(0, context.measureText(label).width));
      const textRenderWidth =
        this.labelMaxWidth === null ? textWidth : Math.min(textWidth, this.labelMaxWidth);
      const itemHeight = Math.max(this.swatchSize, this.labelFontSize);
      measured.push({
        index,
        label,
        color: this.callbacks.getSeriesColor(index),
        direction,
        textWidth,
        textRenderWidth,
        width: this.swatchSize + this.swatchGap + textRenderWidth,
        height: itemHeight,
      });
    }
    context.restore();
    return measured;
  }

  getMeasuredItems(context: RenderContext2D): LegendMeasuredItem[] {
    const seriesCount = this.callbacks.getSeriesCount();
    if (
      this.measurementInputRevision === this.inputRevision &&
      this.measurementSeriesCount === seriesCount &&
      this.measurementTextDirection === this.state.textDirection
    ) {
      return this.measuredItemsCache;
    }
    this.measurementInputRevision = this.inputRevision;
    this.measurementSeriesCount = seriesCount;
    this.measurementTextDirection = this.state.textDirection;
    this.measurementRevision++;
    this.measuredItemsCache = this.measureItems(context);
    this.reserveSnapshot = null;
    this.layoutSnapshot = null;
    return this.measuredItemsCache;
  }

  private getRows(items: LegendMeasuredItem[], maxWidth = Number.POSITIVE_INFINITY): LegendRow[] {
    if (items.length === 0) return [];

    const rows: LegendRow[] = [];
    let rowItems: LegendMeasuredItem[] = [];
    let rowWidth = 0;
    let rowHeight = 0;
    const finishRow = () => {
      if (rowItems.length === 0) return;
      rows.push({ items: rowItems, width: rowWidth, height: rowHeight });
      rowItems = [];
      rowWidth = 0;
      rowHeight = 0;
    };

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const nextWidth = rowWidth + (rowItems.length > 0 ? this.itemGap : 0) + item.width;
      if (rowItems.length > 0 && nextWidth > maxWidth) finishRow();
      if (rowItems.length > 0) rowWidth += this.itemGap;
      rowItems.push(item);
      rowWidth += item.width;
      rowHeight = Math.max(rowHeight, item.height);
    }
    finishRow();
    return rows;
  }

  private getBlockSize(
    items: LegendMeasuredItem[],
    maxRowWidth = Number.POSITIVE_INFINITY,
  ): { width: number; height: number } {
    if (items.length === 0) return { width: 0, height: 0 };
    if (this.layout === "row") {
      const rows = this.getRows(items, maxRowWidth);
      let width = 0;
      let height = 0;
      for (let index = 0; index < rows.length; index++) {
        if (index > 0) height += this.itemGap;
        width = Math.max(width, rows[index].width);
        height += rows[index].height;
      }
      return { width, height };
    }

    let width = 0;
    let height = 0;
    for (let index = 0; index < items.length; index++) {
      if (index > 0) height += this.itemGap;
      height += items[index].height;
      width = Math.max(width, items[index].width);
    }
    return { width, height };
  }

  private getHorizontalContentWidth(): number {
    const left =
      this.state.paddingBase.left +
      this.state.labelLeftSpace +
      Math.max(0, this.state.leftAxisTickLength);
    const right =
      this.state.paddingBase.right +
      this.state.labelRightSpace +
      Math.max(0, this.state.rightAxisTickLength);
    return Math.max(0, this.state.width - left - right - this.padding.left - this.padding.right);
  }

  private getReserveSize(items: LegendMeasuredItem[]): number {
    if (items.length === 0) return 0;
    const wrapWidth =
      this.layout === "row" && (this.position === "top" || this.position === "bottom")
        ? this.getHorizontalContentWidth()
        : Number.POSITIVE_INFINITY;
    const block = this.getBlockSize(items, wrapWidth);
    if (this.position === "left" || this.position === "right") {
      return Math.ceil(block.width + this.padding.left + this.padding.right);
    }
    return Math.ceil(block.height + this.padding.top + this.padding.bottom);
  }

  getCachedReserveSize(items: LegendMeasuredItem[]): number {
    const previous = this.reserveSnapshot;
    if (
      previous?.measurementRevision === this.measurementRevision &&
      previous.width === this.state.width &&
      previous.layout === this.layout &&
      previous.position === this.position &&
      previous.itemGap === this.itemGap &&
      previous.paddingTop === this.padding.top &&
      previous.paddingRight === this.padding.right &&
      previous.paddingBottom === this.padding.bottom &&
      previous.paddingLeft === this.padding.left &&
      previous.basePaddingLeft === this.state.paddingBase.left &&
      previous.basePaddingRight === this.state.paddingBase.right &&
      previous.labelLeftSpace === this.state.labelLeftSpace &&
      previous.labelRightSpace === this.state.labelRightSpace &&
      previous.leftAxisTickLength === this.state.leftAxisTickLength &&
      previous.rightAxisTickLength === this.state.rightAxisTickLength
    ) {
      return this.reserveCacheValue;
    }
    this.reserveSnapshot = {
      measurementRevision: this.measurementRevision,
      width: this.state.width,
      layout: this.layout,
      position: this.position,
      itemGap: this.itemGap,
      paddingTop: this.padding.top,
      paddingRight: this.padding.right,
      paddingBottom: this.padding.bottom,
      paddingLeft: this.padding.left,
      basePaddingLeft: this.state.paddingBase.left,
      basePaddingRight: this.state.paddingBase.right,
      labelLeftSpace: this.state.labelLeftSpace,
      labelRightSpace: this.state.labelRightSpace,
      leftAxisTickLength: this.state.leftAxisTickLength,
      rightAxisTickLength: this.state.rightAxisTickLength,
    };
    this.reserveCacheValue = this.getReserveSize(items);
    return this.reserveCacheValue;
  }

  applyDynamicPadding(reserveSize: number): void {
    this.state.padding.top =
      this.state.paddingBase.top +
      this.state.labelTopSpace +
      Math.max(0, this.state.topAxisTickLength);
    this.state.padding.right =
      this.state.paddingBase.right +
      this.state.labelRightSpace +
      Math.max(0, this.state.rightAxisTickLength);
    this.state.padding.bottom =
      this.state.paddingBase.bottom +
      this.state.labelBottomSpace +
      Math.max(0, this.state.bottomAxisTickLength);
    this.state.padding.left =
      this.state.paddingBase.left +
      this.state.labelLeftSpace +
      Math.max(0, this.state.leftAxisTickLength);

    this.bottomReserve = 0;
    if (!this.visible || reserveSize <= 0) return;
    if (this.position === "left") this.state.padding.left += reserveSize;
    if (this.position === "right") this.state.padding.right += reserveSize;
    if (this.position === "top") this.state.padding.top += reserveSize;
    if (this.position === "bottom") {
      this.state.padding.bottom += reserveSize;
      this.bottomReserve = reserveSize;
    }
  }

  private getStartOffset(axisLength: number, contentLength: number): number {
    const maxOffset = Math.max(0, axisLength - contentLength);
    if (this.align === "left") return 0;
    if (this.align === "right") return maxOffset;
    return maxOffset * 0.5;
  }

  private buildLayout(items: LegendMeasuredItem[], reserveSize: number): LegendLayoutItem[] {
    if (!this.visible || items.length === 0 || reserveSize <= 0) return [];

    let areaX = 0;
    let areaY = 0;
    let areaWidth = 0;
    let areaHeight = 0;
    switch (this.position) {
      case "left":
        areaY = this.state.chartTop;
        areaWidth = reserveSize;
        areaHeight = this.state.chartHeight;
        break;
      case "right":
        areaX = this.state.width - reserveSize;
        areaY = this.state.chartTop;
        areaWidth = reserveSize;
        areaHeight = this.state.chartHeight;
        break;
      case "top":
        areaX = this.state.padding.left;
        areaWidth = this.state.chartWidth;
        areaHeight = reserveSize;
        break;
      case "bottom": {
        const rangeAreaBottom =
          this.state.showRangeSelector && this.state.rangeSelectorPosition === "bottom"
            ? this.state.rangeSelectorHeight + this.state.rangeSelectorGap
            : 0;
        areaX = this.state.padding.left;
        areaY = this.state.height - rangeAreaBottom - reserveSize;
        areaWidth = this.state.chartWidth;
        areaHeight = reserveSize;
        break;
      }
    }

    const contentX = areaX + this.padding.left;
    const contentY = areaY + this.padding.top;
    const contentWidth = Math.max(0, areaWidth - this.padding.left - this.padding.right);
    const contentHeight = Math.max(0, areaHeight - this.padding.top - this.padding.bottom);
    const wrapWidth =
      this.layout === "row" && (this.position === "top" || this.position === "bottom")
        ? contentWidth
        : Number.POSITIVE_INFINITY;
    const block = this.getBlockSize(items, wrapWidth);

    let blockX = contentX;
    let blockY = contentY;
    if (this.position === "top" || this.position === "bottom") {
      blockX += clampLegendOffset(
        this.getStartOffset(contentWidth, block.width),
        Math.max(0, contentWidth - block.width),
      );
      blockY += clampLegendOffset(
        (contentHeight - block.height) * 0.5,
        Math.max(0, contentHeight - block.height),
      );
    } else {
      blockX += clampLegendOffset(
        (contentWidth - block.width) * 0.5,
        Math.max(0, contentWidth - block.width),
      );
      const verticalAlign =
        this.align === "left" ? "top" : this.align === "right" ? "bottom" : "middle";
      if (verticalAlign === "bottom") {
        blockY += Math.max(0, contentHeight - block.height);
      } else if (verticalAlign === "middle") {
        blockY += clampLegendOffset(
          (contentHeight - block.height) * 0.5,
          Math.max(0, contentHeight - block.height),
        );
      }
    }

    const result: LegendLayoutItem[] = [];
    if (this.layout === "row") {
      const rows = this.getRows(items, wrapWidth);
      let cursorY = blockY;
      for (const row of rows) {
        let cursorX =
          this.position === "top" || this.position === "bottom"
            ? contentX + this.getStartOffset(contentWidth, row.width)
            : blockX;
        for (const item of row.items) {
          const rtl = isRtlTextDirection(item.direction);
          const itemY = cursorY + (row.height - item.height) * 0.5;
          result.push(this.createLayoutItem(item, cursorX, itemY, rtl));
          cursorX += item.width + this.itemGap;
        }
        cursorY += row.height + this.itemGap;
      }
      return result;
    }

    let cursorY = blockY;
    for (const item of items) {
      result.push(this.createLayoutItem(item, blockX, cursorY, isRtlTextDirection(item.direction)));
      cursorY += item.height + this.itemGap;
    }
    return result;
  }

  private createLayoutItem(
    item: LegendMeasuredItem,
    x: number,
    y: number,
    rtl: boolean,
  ): LegendLayoutItem {
    const swatchCenterY = y + item.height * 0.5;
    return {
      ...item,
      x,
      y,
      swatchCenterX: rtl
        ? x + item.textRenderWidth + this.swatchGap + this.swatchSize * 0.5
        : x + this.swatchSize * 0.5,
      swatchCenterY,
      textX: rtl ? x + item.textRenderWidth : x + this.swatchSize + this.swatchGap,
      textY: swatchCenterY,
      textAlign: resolveCanvasTextAlign("start", item.direction),
    };
  }

  getCachedLayout(items: LegendMeasuredItem[], reserveSize: number): LegendLayoutItem[] {
    const previous = this.layoutSnapshot;
    if (
      previous?.measurementRevision === this.measurementRevision &&
      previous.reserveSize === reserveSize &&
      previous.position === this.position &&
      previous.layout === this.layout &&
      previous.align === this.align &&
      previous.itemGap === this.itemGap &&
      previous.width === this.state.width &&
      previous.height === this.state.height &&
      previous.chartTop === this.state.chartTop &&
      previous.chartHeight === this.state.chartHeight &&
      previous.chartWidth === this.state.chartWidth &&
      previous.paddingLeft === this.state.padding.left &&
      previous.paddingRight === this.state.padding.right &&
      previous.showRangeSelector === this.state.showRangeSelector &&
      previous.rangeSelectorPosition === this.state.rangeSelectorPosition &&
      previous.rangeSelectorHeight === this.state.rangeSelectorHeight &&
      previous.rangeSelectorGap === this.state.rangeSelectorGap &&
      previous.legendPaddingTop === this.padding.top &&
      previous.legendPaddingRight === this.padding.right &&
      previous.legendPaddingBottom === this.padding.bottom &&
      previous.legendPaddingLeft === this.padding.left
    ) {
      return this.layoutItemsCache;
    }
    this.layoutSnapshot = {
      measurementRevision: this.measurementRevision,
      reserveSize,
      position: this.position,
      layout: this.layout,
      align: this.align,
      itemGap: this.itemGap,
      width: this.state.width,
      height: this.state.height,
      chartTop: this.state.chartTop,
      chartHeight: this.state.chartHeight,
      chartWidth: this.state.chartWidth,
      paddingLeft: this.state.padding.left,
      paddingRight: this.state.padding.right,
      showRangeSelector: this.state.showRangeSelector,
      rangeSelectorPosition: this.state.rangeSelectorPosition,
      rangeSelectorHeight: this.state.rangeSelectorHeight,
      rangeSelectorGap: this.state.rangeSelectorGap,
      legendPaddingTop: this.padding.top,
      legendPaddingRight: this.padding.right,
      legendPaddingBottom: this.padding.bottom,
      legendPaddingLeft: this.padding.left,
    };
    this.layoutRevision++;
    this.layoutItemsCache = this.buildLayout(items, reserveSize);
    this.hitboxes.length = this.layoutItemsCache.length;
    for (let index = 0; index < this.layoutItemsCache.length; index++) {
      const item = this.layoutItemsCache[index];
      const hitbox = this.hitboxes[index];
      if (hitbox) {
        hitbox.index = item.index;
        hitbox.x = item.x;
        hitbox.y = item.y;
        hitbox.width = item.width;
        hitbox.height = item.height;
      } else {
        this.hitboxes[index] = {
          index: item.index,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        };
      }
    }
    return this.layoutItemsCache;
  }

  draw(context: RenderContext2D, items: LegendLayoutItem[]): void {
    if (!this.visible || items.length === 0) return;
    context.save();
    context.font = this.getFont();
    context.textBaseline = "middle";
    for (const item of items) {
      context.save();
      context.globalAlpha = this.callbacks.isSeriesVisible(item.index) ? 1 : this.inactiveOpacity;
      drawMarker(
        context,
        item.swatchCenterX,
        item.swatchCenterY,
        this.swatchShape,
        this.swatchSize * 0.5,
        item.color,
        this.swatchBorderColor,
        this.swatchBorderWidth,
      );
      context.fillStyle = this.labelFontColor;
      applyCanvasTextDirection(context, this.state, item.label);
      context.textAlign = item.textAlign;
      context.fillText(item.label, item.textX, item.textY, item.textRenderWidth);
      context.restore();
    }
    context.restore();
  }

  handleClick(x: number, y: number): boolean {
    if (!this.visible || !this.interactive || this.hitboxes.length === 0) {
      return false;
    }
    for (let index = this.hitboxes.length - 1; index >= 0; index--) {
      const hitbox = this.hitboxes[index];
      if (
        x >= hitbox.x &&
        x <= hitbox.x + hitbox.width &&
        y >= hitbox.y &&
        y <= hitbox.y + hitbox.height
      ) {
        return this.callbacks.setSeriesVisibility(
          hitbox.index,
          !this.callbacks.isSeriesVisible(hitbox.index),
          "legend",
        );
      }
    }
    return false;
  }

  postLayoutIfChanged(): void {
    const padding = this.state.padding;
    const xAxisHeight = padding.bottom - this.bottomReserve;
    const previous = this.lastLayoutSnapshot;
    if (
      previous?.width === this.state.width &&
      previous.height === this.state.height &&
      previous.chartTop === this.state.chartTop &&
      previous.chartHeight === this.state.chartHeight &&
      previous.paddingTop === padding.top &&
      previous.paddingRight === padding.right &&
      previous.paddingBottom === padding.bottom &&
      previous.paddingLeft === padding.left &&
      previous.xAxisHeight === xAxisHeight &&
      previous.legendInteractive === this.interactive &&
      previous.legendLayoutRevision === this.layoutRevision
    ) {
      return;
    }
    this.lastLayoutSnapshot = {
      width: this.state.width,
      height: this.state.height,
      chartTop: this.state.chartTop,
      chartHeight: this.state.chartHeight,
      paddingTop: padding.top,
      paddingRight: padding.right,
      paddingBottom: padding.bottom,
      paddingLeft: padding.left,
      xAxisHeight,
      legendInteractive: this.interactive,
      legendLayoutRevision: this.layoutRevision,
    };
    this.callbacks.postMessage({
      type: "layout",
      padding: {
        top: padding.top,
        right: padding.right,
        bottom: padding.bottom,
        left: padding.left,
      },
      xAxisHeight,
      legendInteractive: this.interactive,
      legendHitboxes: this.hitboxes,
    });
  }
}
