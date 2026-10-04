import { describe, expect, it } from "vitest";
import { ADSENSE_CLIENT_ID, ADSENSE_PUBLISHER_ID, adsAllowedFor } from "../src/lib/adsense";

describe("ADSENSE_PUBLISHER_ID", () => {
  it("drops the ca- prefix so /ads.txt and the ad script name the same publisher", () => {
    // ads.txt は "pub-..." 形式、広告スクリプトは "ca-pub-..." 形式を要求する。
    // 食い違うとAdSenseが「認定販売者として宣言されていない」と判断して広告が止まる。
    expect(ADSENSE_CLIENT_ID.startsWith("ca-pub-")).toBe(true);
    expect(ADSENSE_PUBLISHER_ID).toBe(ADSENSE_CLIENT_ID.replace(/^ca-/, ""));
    expect(ADSENSE_PUBLISHER_ID.startsWith("pub-")).toBe(true);
  });
});

describe("adsAllowedFor", () => {
  it("shows ads to signed-out visitors", () => {
    expect(adsAllowedFor({ hasToken: false, loading: false, status: null })).toBe(true);
    expect(adsAllowedFor({ hasToken: false, loading: true, status: null })).toBe(true);
  });

  it("hides ads from paying subscribers", () => {
    expect(adsAllowedFor({ hasToken: true, loading: false, status: { active: true } })).toBe(false);
  });

  it("shows ads to signed-in users without a subscription", () => {
    expect(adsAllowedFor({ hasToken: true, loading: false, status: { active: false } })).toBe(true);
  });

  it("hides ads while the subscription state is still loading", () => {
    // 加入者に一瞬でも広告が見えるより、無料ユーザーへの表示が一拍遅れる方が害が小さい。
    expect(adsAllowedFor({ hasToken: true, loading: true, status: null })).toBe(false);
    expect(adsAllowedFor({ hasToken: true, loading: true, status: { active: false } })).toBe(false);
  });

  it("falls back to showing ads when the subscription state cannot be fetched", () => {
    // ここで隠す側に倒すと、サブスクAPIが不調な間だけ広告収入が静かにゼロになり、誰も気づけない。
    expect(adsAllowedFor({ hasToken: true, loading: false, status: null })).toBe(true);
  });
});
