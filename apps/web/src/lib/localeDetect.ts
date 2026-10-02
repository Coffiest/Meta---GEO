/**
 * 表示言語の自動判定(オーナー確定仕様: 端末の言語 + 国の組み合わせ)。
 *
 * 1. 本人が選んだ言語(保存値)があれば、それが最優先(この関数の外で扱う)
 * 2. 端末の言語の一覧(`navigator.languages`、優先度順)を上から照合し、対応言語に寄せる
 *    (en-GB → en、pt-PT → pt-BR、es-MX → es のように地域違いは同じ言語へ)
 * 3. 国(アクセス元の IP。Vercel の `x-vercel-ip-country`)は次の2つにだけ使う
 *    - 中国語の繁体字/簡体字の決め分け(言語タグに書体も地域も無い "zh" のとき)
 *    - 端末の言語がどれも対応外のときの補い(国の主な言語)
 * 4. それでも決まらなければ英語
 *
 * 国だけで決めないのは、VPN・旅行者・多言語国(カナダ・スイス・インド等)で外れるため。
 * 代わりに、端末の言語と国の言語が食い違うときは自動では切り替えず、「◯◯語で表示しますか?」と
 * 提案する(`suggestion`)。英語圏の国は提案しない(英語端末の日本人が米国にいる等で煩わしいだけなので)。
 */
export type Locale = "ja" | "en" | "ko" | "zh" | "zh-Hant" | "pt-BR" | "es";

export const SUPPORTED_LOCALES: readonly Locale[] = ["ja", "en", "ko", "zh", "zh-Hant", "pt-BR", "es"];

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(x);
}

const TRADITIONAL_CHINESE_COUNTRIES = new Set(["TW", "HK", "MO"]);

const SPANISH_COUNTRIES = new Set([
  "ES", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "GT", "CU", "BO", "DO", "HN", "PY", "SV", "NI", "CR", "PA", "UY", "PR", "GQ",
]);
const PORTUGUESE_COUNTRIES = new Set(["BR", "PT", "AO", "MZ", "CV", "GW", "ST", "TL"]);

/** 国の主な言語(対応しているものだけ)。英語圏や対応外の国は null。 */
export function localeForCountry(country: string | null | undefined): Locale | null {
  if (!country) return null;
  const c = country.toUpperCase();
  if (c === "JP") return "ja";
  if (c === "KR") return "ko";
  if (TRADITIONAL_CHINESE_COUNTRIES.has(c)) return "zh-Hant";
  if (c === "CN" || c === "SG") return "zh";
  if (PORTUGUESE_COUNTRIES.has(c)) return "pt-BR";
  if (SPANISH_COUNTRIES.has(c)) return "es";
  return null;
}

/** 言語タグ1つを対応言語に寄せる。中国語で書体が決まらないときは国で決める。 */
export function matchLanguageTag(tag: string, country: string | null | undefined): Locale | null {
  const lower = tag.trim().toLowerCase();
  if (!lower) return null;
  const [lang, ...rest] = lower.split(/[-_]/);
  switch (lang) {
    case "ja":
      return "ja";
    case "en":
      return "en";
    case "ko":
      return "ko";
    case "pt":
      return "pt-BR";
    case "es":
      return "es";
    case "zh": {
      if (rest.includes("hant")) return "zh-Hant";
      if (rest.includes("hans")) return "zh";
      if (rest.some((r) => TRADITIONAL_CHINESE_COUNTRIES.has(r.toUpperCase()))) return "zh-Hant";
      if (rest.some((r) => r === "cn" || r === "sg" || r === "my")) return "zh";
      return country && TRADITIONAL_CHINESE_COUNTRIES.has(country.toUpperCase()) ? "zh-Hant" : "zh";
    }
    default:
      return null;
  }
}

export interface LocaleDecision {
  locale: Locale;
  /** 自動では切り替えず、提案だけする言語(国の言語が端末の言語と食い違うとき)。 */
  suggestion: Locale | null;
}

export function resolveLocale(input: { languages: readonly string[]; country?: string | null }): LocaleDecision {
  const country = input.country ?? null;
  let fromLanguages: Locale | null = null;
  for (const tag of input.languages) {
    fromLanguages = matchLanguageTag(tag, country);
    if (fromLanguages) break;
  }
  const fromCountry = localeForCountry(country);
  const locale = fromLanguages ?? fromCountry ?? "en";
  const suggestion = fromCountry && fromCountry !== locale ? fromCountry : null;
  return { locale, suggestion };
}
