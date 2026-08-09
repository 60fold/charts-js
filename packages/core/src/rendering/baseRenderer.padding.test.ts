import { describe, expect, it } from "vitest";
import {
  WorkerState,
  handleBaseMessage,
  measureLabelSpace,
  parseLabelsConfig,
  savePaddingBase,
} from "./baseRenderer";

describe("runtime padding updates", () => {
  it("patches base padding without compounding label reserves", () => {
    const state = new WorkerState();
    state.padding = { top: 20, right: 80, bottom: 40, left: 80 };
    savePaddingBase(state);
    parseLabelsConfig(state, {
      top: { text: "Title", font: { size: 16 } },
    });
    measureLabelSpace(state);
    const reservedTop = state.padding.top;

    handleBaseMessage(state, "updateAppearance", { patch: { padding: { left: 50 } } }, 0);
    handleBaseMessage(state, "updateAppearance", { patch: { padding: { left: 60 } } }, 0);

    expect(state.paddingBase).toEqual({
      top: 20,
      right: 80,
      bottom: 40,
      left: 60,
    });
    expect(state.padding.top).toBe(reservedTop);
    expect(state.padding.left).toBe(60);
  });
});
