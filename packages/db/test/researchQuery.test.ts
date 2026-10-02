import { describe, expect, it } from "vitest";
import { isResearchDimension, isResearchMetric, researchWhereSql } from "../src/researchQuery.js";

/** データ研究の集計の安全性(DB不要)。 */
describe("researchQuery", () => {
  it("「自分」のときだけ本人の行に絞る", () => {
    const all = researchWhereSql({ dimension: "thinkBucket", metric: "foldRate", scope: "all", userId: "u1" });
    expect(all.sql).not.toContain(`"userId"`);
    const me = researchWhereSql({ dimension: "thinkBucket", metric: "foldRate", scope: "me", userId: "u1" });
    expect(me.sql).toContain(`"userId" = `);
    expect(me.values).toContain("u1");
  });

  it("軸と指標は許可リストのものだけ", () => {
    expect(isResearchDimension("thinkBucket")).toBe(true);
    expect(isResearchDimension(`"userId"; DROP TABLE "User"`)).toBe(false);
    expect(isResearchDimension("isBot")).toBe(false);
    expect(isResearchMetric("vpip")).toBe(true);
    expect(isResearchMetric("toString")).toBe(false);
  });

  it("絞り込みの値はパラメータで渡し、知らない値は無視する", () => {
    const sql = researchWhereSql({
      dimension: "street",
      metric: "vpip",
      scope: "me",
      userId: "u1",
      filters: { street: "flop", position: "BTN", gameType: "evil'; --", days: 7 },
    });
    expect(sql.values).toContain("u1");
    expect(sql.values).toContain("flop");
    expect(sql.values).toContain("BTN");
    expect(sql.sql).not.toContain("evil");
    expect(sql.values).not.toContain("evil'; --");
    // ハンド単位の指標は、各ハンドの最初の行だけを数える。
    expect(sql.sql).toContain(`"firstInHand" = true`);
  });

  it("全プレイヤーの集計では、自分の ID で絞らない", () => {
    const sql = researchWhereSql({ dimension: "street", metric: "foldRate", scope: "all", userId: "u1" });
    expect(sql.values).not.toContain("u1");
  });
});
