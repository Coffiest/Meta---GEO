import { describe, expect, it } from "vitest";
import { localeForCountry, matchLanguageTag, resolveLocale } from "../src/lib/localeDetect";

describe("resolveLocale(端末の言語 + 国)", () => {
  it("端末の言語の一覧を優先度順に照合し、地域違いは同じ言語へ寄せる", () => {
    expect(resolveLocale({ languages: ["pt-BR", "en"] }).locale).toBe("pt-BR");
    expect(resolveLocale({ languages: ["pt-PT"] }).locale).toBe("pt-BR");
    expect(resolveLocale({ languages: ["es-MX", "es"] }).locale).toBe("es");
    expect(resolveLocale({ languages: ["en-GB"] }).locale).toBe("en");
    // 対応外の言語は飛ばして次の候補を見る
    expect(resolveLocale({ languages: ["de-DE", "es-AR"] }).locale).toBe("es");
  });

  it("以前は対応外の言語がすべて日本語になっていた。今は国 → 英語の順で補う", () => {
    expect(resolveLocale({ languages: ["de-DE"], country: "DE" }).locale).toBe("en");
    expect(resolveLocale({ languages: ["de-DE"], country: "BR" }).locale).toBe("pt-BR");
    expect(resolveLocale({ languages: [] }).locale).toBe("en");
  });

  it("中国語の繁体字/簡体字", () => {
    expect(matchLanguageTag("zh-TW", null)).toBe("zh-Hant");
    expect(matchLanguageTag("zh-Hant-HK", null)).toBe("zh-Hant");
    expect(matchLanguageTag("zh-Hans-CN", null)).toBe("zh");
    expect(matchLanguageTag("zh-CN", "TW")).toBe("zh");
    // 書体も地域も無い "zh" は国で決める
    expect(matchLanguageTag("zh", "TW")).toBe("zh-Hant");
    expect(matchLanguageTag("zh", "CN")).toBe("zh");
  });

  it("端末の言語と国の言語が食い違うときは、切り替えずに提案する(英語圏の国は提案しない)", () => {
    expect(resolveLocale({ languages: ["en-US"], country: "BR" })).toEqual({ locale: "en", suggestion: "pt-BR" });
    expect(resolveLocale({ languages: ["ja-JP"], country: "US" })).toEqual({ locale: "ja", suggestion: null });
    expect(resolveLocale({ languages: ["ja-JP"], country: "JP" })).toEqual({ locale: "ja", suggestion: null });
  });

  it("国の主な言語", () => {
    expect(localeForCountry("mx")).toBe("es");
    expect(localeForCountry("JP")).toBe("ja");
    expect(localeForCountry("US")).toBeNull();
    expect(localeForCountry(null)).toBeNull();
  });
});
