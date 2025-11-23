import { analyzeSearchInput } from "./search_input";

describe("analyzeSearchInput", () => {
  it("detects prefixed Chinese A-share symbols", () => {
    const out = analyzeSearchInput("sh600988");
    expect(out.isSymbolLike).toBe(true);
    expect(out.symbolCandidates).toContain("SH600988");
  });

  it("guess variants for numeric-only codes", () => {
    const out = analyzeSearchInput("600988");
    expect(out.symbolCandidates).toEqual(["600988", "SH600988"]);
  });

  it("treats plain names as non-symbol queries", () => {
    const out = analyzeSearchInput("中信证券");
    expect(out.isSymbolLike).toBe(false);
    expect(out.symbolCandidates).toHaveLength(0);
  });
});
