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
