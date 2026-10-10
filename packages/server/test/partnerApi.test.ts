import { describe, expect, it } from "vitest";
import { statementRowStatus } from "../src/partnerApi.js";

/** インフルエンサーの明細の各行の状態(日本時間の月末締め)。 */
describe("statementRowStatus", () => {
  const now = new Date("2026-11-10T03:00:00Z");
  it("対象外は理由を優先", () => {
    expect(statementRowStatus({ voidReason: "self", payoutId: "po", occurredAt: now }, now)).toBe("void_self");
    expect(statementRowStatus({ voidReason: "expired", payoutId: null, occurredAt: now }, now)).toBe("void_expired");
  });
  it("払った行 / 締めた月 / 今月", () => {
    expect(statementRowStatus({ voidReason: null, payoutId: "po", occurredAt: now }, now)).toBe("paid");
    // 10/31 23:30 JST は10月分(締め済み)
    expect(statementRowStatus({ voidReason: null, payoutId: null, occurredAt: new Date("2026-10-31T14:30:00Z") }, now)).toBe("payable");
    // 11/1 0:30 JST は11月分(今月)
    expect(statementRowStatus({ voidReason: null, payoutId: null, occurredAt: new Date("2026-10-31T15:30:00Z") }, now)).toBe("accruing");
  });
});
