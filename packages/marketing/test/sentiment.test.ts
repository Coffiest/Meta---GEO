import { describe, expect, it } from "vitest";
import { analyzeSentiment } from "../src/sentiment.js";

/**
 * この検知は「見逃さないこと」が目的。空振りは人が1秒で捨てられるが、
 * 見逃した炎上は取り返せない。テストもその優先順位で書く。
 */
describe("analyzeSentiment", () => {
  it("法務・信用に関わる語は critical として最優先で拾う", () => {
    const r = analyzeSentiment("このアプリ詐欺じゃないの？金返せ");
    expect(r.severity).toBe("critical");
    expect(r.needsAttention).toBe(true);
    expect(r.hits.some((h) => h.term === "詐欺")).toBe(true);
  });

  it("不満の表明は warning として通知する", () => {
    const r = analyzeSentiment("重いしすぐ落ちる。萎えた");
    expect(r.severity).toBe("warning");
    expect(r.needsAttention).toBe(true);
  });

  it("軽い否定は info に留め、通知で人を起こさない", () => {
    const r = analyzeSentiment("UIがちょっと分かりにくいかも");
    expect(r.severity).toBe("info");
    expect(r.needsAttention).toBe(false);
  });

  it("肯定的な投稿は何も拾わない", () => {
    const r = analyzeSentiment("GEOのデータ面白い！勝率上がった");
    expect(r.severity).toBeNull();
    expect(r.hits).toEqual([]);
    expect(r.needsAttention).toBe(false);
  });

  it("打ち消しを誤検知しない", () => {
    // 「最悪じゃない」を warning にすると、褒め言葉で人を起こしてしまう。
    expect(analyzeSentiment("最悪じゃない、むしろ良い").severity).toBeNull();
  });

  it("critical と warning が混ざったら critical を採る", () => {
    const r = analyzeSentiment("最悪。返金してほしい");
    expect(r.severity).toBe("critical");
    // 拾った根拠が両方残ること(人が判断を却下できるように)。
    expect(r.hits.length).toBeGreaterThanOrEqual(2);
  });

  it("英語の重大語も拾う", () => {
    expect(analyzeSentiment("this looks like a scam").severity).toBe("critical");
  });

  it("拾った理由を必ず添える", () => {
    const r = analyzeSentiment("不具合が多い");
    expect(r.hits[0]!.reason.length).toBeGreaterThan(0);
  });
});
