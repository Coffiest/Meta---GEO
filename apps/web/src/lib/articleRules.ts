// engine は**モジュール単位で**インポートする(ルートは node:crypto を取り込むため)。
import { ARTICLE_RULES } from "@meta-geo/engine/src/review/articleRules.generated.js";
import type { ArticleRule } from "@meta-geo/engine/src/review/articleRules.js";

/**
 * 解説の知識ベース(`packages/engine/knowledge/*.md`)から書き起こしたルールを id で引く。
 * どのルールが当たったかはサーバーが決めて決定に載せる(`decision.article.id`)。画面は文章を出すだけ。
 */
const BY_ID: ReadonlyMap<string, ArticleRule> = new Map(ARTICLE_RULES.map((r) => [r.id, r]));

export function articleRuleById(id: string | null | undefined): ArticleRule | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** 解説の文中の置き換え語(`{hand}` など)の値。分からないものは入れない(その語は「—」になる)。 */
export type TemplateVars = Partial<Record<"hand" | "handCategory" | "pos" | "effBb" | "facingBb" | "potOdds" | "spr", string>>;

/** `{hand}` などを決定ごとの値に置き換える。値が無い語は「—」にする(語そのものを画面に出さない)。 */
export function fillTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{([A-Za-z]+)\}/g, (_, k: string) => vars[k as keyof TemplateVars] ?? "—");
}

/**
 * 局面の既定の解説(`spots.md`)か。具体的な知識(記事・Notion)が無いときの受け皿として、後回しにする。
 * ただし priority が正のもの(オールインへの対応のポットオッズなど、その局面で一番役に立つ解説)は後回しにしない。
 */
export function isFallbackRule(rule: ArticleRule | undefined): boolean {
  return Boolean(rule?.id.startsWith("spot-") && rule.priority <= 0);
}
