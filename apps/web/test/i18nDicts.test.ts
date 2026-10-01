import { describe, expect, it } from "vitest";
import { LOCALES, translate } from "../src/lib/i18n";
import { es } from "../src/lib/locales/es";
import { ptBR } from "../src/lib/locales/ptBR";
import { zhHant } from "../src/lib/locales/zhHant";

/**
 * 辞書の検査。自動で卓を埋めるプレイヤーの存在を示す語は、どの言語にも出してはいけない(最優先の運用ルール)。
 * 新しい言語の辞書は、日本語の辞書と同じキー・同じ差し込み({name} 等)を持つこと。
 */
const BANNED = /\bbots?\b|robô|robot|бот|機器人|机器人|봇|ボット/i;

describe("i18n の辞書", () => {
  it("どの言語の文言にも、自動プレイヤーを示す語が無い", () => {
    for (const { code } of LOCALES) {
      for (const key of Object.keys(ptBR)) {
        const text = translate(code, key);
        expect(BANNED.test(text), `${code} ${key}: ${text}`).toBe(false);
      }
    }
  });

  it("新しい言語の辞書は同じキーと同じ差し込みを持つ", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    const base = ptBR;
    for (const dict of [es, zhHant]) {
      expect(Object.keys(dict).sort()).toEqual(Object.keys(base).sort());
      for (const key of Object.keys(base)) expect(placeholders(dict[key]!)).toBe(placeholders(base[key]!));
    }
    for (const key of Object.keys(base)) expect(placeholders(translate("ja", key))).toBe(placeholders(base[key]!));
  });
});
