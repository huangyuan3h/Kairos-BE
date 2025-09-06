import { MacroLiquiditySnapshotTool } from "../macro";

describe("MacroLiquiditySnapshotTool", () => {
  it("returns snapshot with regime, bullets and meta", async () => {
    const res = await MacroLiquiditySnapshotTool.execute({ windowDays: 7 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { snapshot, regime, bullets, meta } = res.data;

    expect(["RiskOn", "Neutral", "RiskOff"]).toContain(regime);
    expect(Array.isArray(bullets)).toBe(true);
    expect(typeof meta.asOf).toBe("string");
    expect(typeof meta.windowDays).toBe("number");

    expect(typeof snapshot).toBe("object");
    expect(typeof snapshot.rates).toBe("object");
    expect(typeof snapshot.fx).toBe("object");
    expect(typeof snapshot.vol).toBe("object");
    expect(typeof snapshot.commodities).toBe("object");
    expect(typeof snapshot.deltas).toBe("object");
  });
});
