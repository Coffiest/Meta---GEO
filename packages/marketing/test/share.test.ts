/**
 * 共有導線のうち、アプリから切り離して確かめられる部分(URLの組み立て)を固定する。
 *
 * withShareTracking はどの画面からの共有が実際に人を連れてきたかを測るための要。
 * ここが壊れると「共有は押されているが流入していない」のか「そもそも押されていない」のかを
 * 区別できなくなり、導線をどこから直せばいいか決められなくなる。
 *
 * ロジックは packages/marketing に1つだけ置き、apps/web はそれを import する。
 * アプリ側へ写して持つとテストが実物を守れなくなるため。
 */
import { describe, expect, it } from "vitest";
import { withShareTracking } from "../src/share.js";

describe("withShareTracking", () => {
  it("流入元を埋める", () => {
    const u = new URL(withShareTracking("https://example.com/share/hand?bb=42", "hand"));
    expect(u.searchParams.get("utm_source")).toBe("share");
    expect(u.searchParams.get("utm_medium")).toBe("social");
    expect(u.searchParams.get("utm_campaign")).toBe("hand");
    // 元のパラメータを壊さない。
    expect(u.searchParams.get("bb")).toBe("42");
  });

  it("画面ごとに campaign を出し分ける", () => {
    const of = (s: string) => new URL(withShareTracking("https://example.com/", s)).searchParams.get("utm_campaign");
    expect(of("invite")).toBe("invite");
    expect(of("milestone")).toBe("milestone");
  });

  it("既に指定があれば尊重する", () => {
    const u = new URL(withShareTracking("https://example.com/?utm_source=ad", "hand"));
    expect(u.searchParams.get("utm_source")).toBe("ad");
  });

  it("URLとして解釈できないものは触らない(壊れたリンクを共有させない)", () => {
    expect(withShareTracking("not a url", "hand")).toBe("not a url");
  });
});
