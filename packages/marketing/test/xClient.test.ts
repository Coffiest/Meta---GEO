import { describe, expect, it } from "vitest";
import { fetchAccountMetrics, searchMentions, hasXCredentials, describeFailure } from "../src/xClient.js";

/**
 * ここで最も大事なのは「鍵が無くても落ちないこと」。
 * 鍵が無い環境の方が普通で、そこで例外を投げると日次バッチごと止まってしまう。
 */
const NO_KEY = {} as NodeJS.ProcessEnv;
const WITH_KEY = { X_BEARER_TOKEN: "dummy" } as NodeJS.ProcessEnv;

/** 呼ばれたら失敗させる fetch。鍵が無いときに通信しないことを確かめるために使う。 */
const mustNotCall = (() => {
  throw new Error("鍵が無いのに通信した");
}) as unknown as typeof fetch;

describe("鍵が無いとき", () => {
  it("例外を投げず no-credentials を返す", async () => {
    const r = await fetchAccountMetrics("pokerart", NO_KEY, mustNotCall);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-credentials");
  });

  it("通信そのものを行わない(無駄な失敗ログを出さない)", async () => {
    // mustNotCall が呼ばれたら例外になるので、解決すれば通信していない。
    await expect(searchMentions("PokerART", NO_KEY, mustNotCall)).resolves.toBeDefined();
  });

  it("hasXCredentials が false になる(管理画面で「未設定」と出せる)", () => {
    expect(hasXCredentials(NO_KEY)).toBe(false);
    expect(hasXCredentials({ X_BEARER_TOKEN: "  " } as NodeJS.ProcessEnv)).toBe(false);
    expect(hasXCredentials(WITH_KEY)).toBe(true);
  });

  it("理由が人の言葉で出る", () => {
    expect(describeFailure({ ok: false, reason: "no-credentials" })).toContain("X_BEARER_TOKEN");
  });
});

describe("鍵があるとき", () => {
  it("フォロワー数を取り出す", async () => {
    const fake = (async () => ({
      ok: true, status: 200,
      json: async () => ({ data: { username: "pokerart", public_metrics: { followers_count: 1234, following_count: 56, tweet_count: 789 } } }),
    })) as unknown as typeof fetch;
    const r = await fetchAccountMetrics("@pokerart", WITH_KEY, fake);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.followers).toBe(1234);
      expect(r.data.posts).toBe(789);
    }
  });

  it("401/403 は unauthorized として区別する(鍵の問題だと分かるように)", async () => {
    const fake = (async () => ({ ok: false, status: 403, json: async () => ({}) })) as unknown as typeof fetch;
    const r = await fetchAccountMetrics("x", WITH_KEY, fake);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unauthorized");
      expect(describeFailure(r)).toContain("プラン");
    }
  });

  it("429 は rate-limited として区別する(時間をおけば直ると分かるように)", async () => {
    const fake = (async () => ({ ok: false, status: 429, json: async () => ({}) })) as unknown as typeof fetch;
    const r = await searchMentions("PokerART", WITH_KEY, fake);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("rate-limited");
  });

  it("通信断も例外にせず error として返す", async () => {
    const fake = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    const r = await fetchAccountMetrics("x", WITH_KEY, fake);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "error") expect(r.message).toContain("network down");
  });

  it("メンション検索はリポストを除く", async () => {
    let captured = "";
    const fake = (async (url: string) => {
      captured = url;
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "1", text: "良い", author_id: "a", created_at: "2026-01-01" }] }) };
    }) as unknown as typeof fetch;
    const r = await searchMentions("PokerART", WITH_KEY, fake);
    expect(r.ok).toBe(true);
    // 同じ文面が大量に流れると監視の意味が薄れるため。
    expect(decodeURIComponent(captured)).toContain("-is:retweet");
  });

  it("応答が空でも空配列を返す(例外にしない)", async () => {
    const fake = (async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch;
    const r = await searchMentions("PokerART", WITH_KEY, fake);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([]);
  });
});
