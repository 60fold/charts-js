// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getApiCatalog, searchApiCatalog, summarizeApiCatalog } from "./catalog.js";

describe("@sixtyfold/mcp API catalog", () => {
  it("ships a versioned immutable catalog", () => {
    const catalog = getApiCatalog();
    expect(catalog.sourceHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(catalog.packages.length).toBeGreaterThanOrEqual(10);
    expect(Object.isFrozen(catalog)).toBe(true);
  });

  it("finds exact component APIs without returning the entire inventory", () => {
    const matches = searchApiCatalog("setLODOptions", {
      packageName: "line",
      limit: 3,
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((match) => match.package === "@sixtyfold/line")).toBe(true);
    expect(matches.length).toBeLessThanOrEqual(3);
  });

  it("keeps every search result inside an agent context budget", () => {
    // A matching member used to drag its entire parent export along with it, so
    // one broad query could return over 50,000 tokens and exhaust a host's
    // context window. Guard the worst case rather than a single happy path.
    const adversarial = [
      "props",
      "chart",
      "options",
      "theme",
      "stock",
      "worker",
      "appearance",
      "onReady",
      "color",
      "data",
    ];
    for (const query of adversarial) {
      const serialized = JSON.stringify(searchApiCatalog(query), null, 2);
      expect(serialized.length, `query "${query}" exceeded the budget`).toBeLessThan(20_000);
    }
  });

  it("returns the matching member of a very large type without its siblings", () => {
    const [match] = searchApiCatalog("onReady", { packageName: "react", limit: 1 });
    expect(match).toBeDefined();
    expect(match!.members.map((member) => member.name)).toEqual(["onReady"]);
    expect(match!.memberCount).toBeGreaterThan(100);
    expect(match!.membersOmitted).toBe(match!.memberCount - 1);
    expect(match!.membersResource).toBe("sixtyfold://api/react");
  });

  it("ships authored type names rather than structurally expanded generics", () => {
    // The catalog generator once resolved property types through the checker,
    // expanding DeepPartial<StockAppearanceOptions> into ~15,000 characters and
    // hiding the name a reader actually needs. Guard the generator's output.
    let longest = 0;
    for (const packageEntry of getApiCatalog().packages) {
      for (const entryPoint of packageEntry.entryPoints) {
        for (const exported of entryPoint.exports) {
          for (const member of exported.members) {
            longest = Math.max(longest, member.signature.length);
          }
        }
      }
    }
    expect(longest).toBeLessThan(2_000);
  });

  it("preserves documented failure contracts", () => {
    const catalog = getApiCatalog();
    const line = catalog.packages.find((entry) => entry.name === "@sixtyfold/line");
    const lineChart = line?.entryPoints
      .find((entry) => entry.name === "@sixtyfold/line")
      ?.exports.find((entry) => entry.name === "LineChart");
    const setData = lineChart?.members.find((member) => member.name === "setData");
    expect(setData?.throws).toEqual([
      "TypeError or RangeError when typed-array columns or declared lengths are malformed or misaligned.",
    ]);

    const stock = catalog.packages.find((entry) => entry.name === "@sixtyfold/stock");
    const loadOHLCVFromCSV = stock?.entryPoints
      .find((entry) => entry.name === "@sixtyfold/stock")
      ?.exports.find((entry) => entry.name === "loadOHLCVFromCSV");
    expect(loadOHLCVFromCSV?.throws).toEqual([
      "Error when the request returns a non-successful HTTP status.",
    ]);

    const [searchResult] = searchApiCatalog("setData TypeError", {
      packageName: "line",
      limit: 1,
    });
    expect(searchResult?.members.find((member) => member.name === "setData")?.throws).toEqual(
      setData?.throws,
    );
  });

  it("never returns a signature longer than the serve-time cap", () => {
    for (const query of ["appearance", "tooltip", "options", "stock", "series"]) {
      for (const match of searchApiCatalog(query)) {
        expect(match.signature.length).toBeLessThan(420);
        for (const member of match.members) {
          expect(member.signature.length, `${match.name}.${member.name}`).toBeLessThan(420);
          if (member.signature.length >= 400) expect(member.signatureTruncated).toBe(true);
        }
      }
    }
  });

  it("summarizes independently published entry points", () => {
    const packages = summarizeApiCatalog();
    expect(packages.some((entry) => entry.name === "@sixtyfold/react")).toBe(true);
    expect(packages.find((entry) => entry.name === "@sixtyfold/react")?.entryPoints).toContain(
      "@sixtyfold/react/line",
    );
  });

  it("does not expose renderer implementation entry points to agents", () => {
    const core = getApiCatalog().packages.find((entry) => entry.name === "@sixtyfold/core");
    expect(core).toBeDefined();
    expect(core!.entryPoints.map((entry) => entry.name)).not.toContain(
      "@sixtyfold/core/rendering/baseRenderer",
    );
    expect(core!.entryPoints.every((entry) => !entry.name.includes("/internal/"))).toBe(true);
  });
});
