import { describe, it, expect } from "vitest";
import { formatValue } from "./units";

describe("formatValue", () => {
  it("applies prefix and suffix with fixed decimals", () => {
    expect(formatValue(12.345, { prefix: "$", suffix: " USD", decimals: 2 })).toBe("$12.35 USD");
  });

  it("formats compact values", () => {
    expect(formatValue(12_345, { formatStyle: "compact", decimals: 1 })).toBe("12.3K");
  });
});
