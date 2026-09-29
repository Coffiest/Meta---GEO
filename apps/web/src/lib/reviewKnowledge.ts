import type { Classification } from "./classification";
import type { ReviewedDecision } from "./reviewApi";

/**
 * 棋譜解析に、オーナーが書いたポーカー知識を添えるための仕組み。
 *
 * 解析そのもの(`packages/db/src/reviewClassify.ts`)は、heroの1アクションを
 * GTO最善からのEV損で9段階に格付けする。ただし返るのは格付けとEV損と頻度だけで、
 * 「**なぜ**その手が悪いのか」を説明する文章がどこにも無い。
 *
 * ここはその空きを埋める層で、**格付けのロジックには一切触らない**。
 * 条件に当てはまった知識を引いてきて、格付けの隣に置くだけ。
 *
 * 知識の実体は `src/data/reviewKnowledge.ts`。Notion に書かれたものを開発時に
 * 取り込む(実行時に Notion を読みにいかないので、追加のコストも遅延も無い)。
 */

/** 解析対象のストリート。showdown には決定が無いので含めない。 */
export type KnowledgeStreet = "preflop" | "flop" | "turn" | "river";

/** 数値の範囲条件。書いた側だけを判定する(min だけ / max だけ、も可)。 */
export interface RangeCond {
  /** この値以上(境界を含む)。 */
  min?: number;
  /** この値**未満**(境界を含まない)。min と揃えず非対称にしてあるのは、
   *  「20bb以下」と「20bb超」のような帯を隙間なく敷き詰められるようにするため。 */
  max?: number;
}

/**
 * 知識が当てはまる条件。
 *
 * **書かれた項目だけを判定する。** 書かなかった項目は「問わない」。
 * 全部省略すれば、あらゆる決定に当てはまる一般論になる。
 */
export interface KnowledgeWhen {
  street?: KnowledgeStreet[];
  /** ポジション名(UTG / HJ / CO / BTN / SB / BB)。 */
  heroPos?: string[];
  /** 9段階の格付け。「悪手のときだけ出す」のような使い方をする。 */
  classification?: Classification[];
  /** 有効スタック(bb)。 */
  effStackBb?: RangeCond;
  /** 直面しているベットサイズ(bb)。直面していない決定には当たらない。 */
  facingSizeBb?: RangeCond;
  /** hero が実際に取った手(geoApi と同じバケット語彙)。 */
  actionBucket?: string[];
  /** GTO が最も高い頻度で取る手。 */
  gtoTopBucket?: string[];
}

export interface KnowledgeEntry {
  /** 一意な識別子。Notion のページに対応させる。 */
  id: string;
  /** 見出し。画面にそのまま出る。 */
  title: string;
  /** 本文。オーナーの文章を加工せずに入れる。 */
  body: string;
  /** 出典(Notion のページURL)。あれば画面に小さく導線を出す。 */
  sourceUrl?: string;
  when: KnowledgeWhen;
}

/** 1つの決定に添える知識の上限。これ以上出すと画面が文章で埋まって読まれなくなる。 */
export const MAX_NOTES_PER_DECISION = 2;

function inRange(value: number | null | undefined, cond: RangeCond | undefined): boolean {
  if (!cond) return true;
  // 条件が書かれているのに値が無い決定は、当てはまらないものとして落とす。
  // (「オーバーベットに直面したら」という知識を、誰もベットしていない局面に出さない)
  if (value === null || value === undefined) return false;
  if (cond.min !== undefined && value < cond.min) return false;
  if (cond.max !== undefined && value >= cond.max) return false;
  return true;
}

function inSet(value: string | null | undefined, allowed: string[] | undefined): boolean {
  if (!allowed) return true;
  if (value === null || value === undefined) return false;
  return allowed.includes(value);
}

/** GTO が最も高い頻度で取る手。頻度0しか無い(=基準なし)なら null。 */
export function gtoTopBucket(d: ReviewedDecision): string | null {
  if (!d.gtoActions || d.gtoActions.length === 0) return null;
  let top: { bucket: string; frequency: number } | null = null;
  for (const a of d.gtoActions) {
    if (a.frequency <= 0) continue;
    if (!top || a.frequency > top.frequency) top = a;
  }
  return top ? top.bucket : null;
}

/** `when` に実際に書かれている条件の数。多いほど具体的な知識とみなす。 */
function specificity(when: KnowledgeWhen): number {
  let n = 0;
  if (when.street) n++;
  if (when.heroPos) n++;
  if (when.classification) n++;
  if (when.effStackBb) n++;
  if (when.facingSizeBb) n++;
  if (when.actionBucket) n++;
  if (when.gtoTopBucket) n++;
  return n;
}

function matches(entry: KnowledgeEntry, d: ReviewedDecision): boolean {
  const w = entry.when;
  if (!inSet(d.street, w.street)) return false;
  if (!inSet(d.heroPos, w.heroPos)) return false;
  if (!inSet(d.classification, w.classification)) return false;
  if (!inRange(d.effStackBb, w.effStackBb)) return false;
  if (!inRange(d.facingSizeBb, w.facingSizeBb)) return false;
  if (!inSet(d.actionTaken.bucket, w.actionBucket)) return false;
  if (!inSet(gtoTopBucket(d), w.gtoTopBucket)) return false;
  return true;
}

/**
 * 1つの決定に添える知識を引く。
 *
 * 条件の数が多いものを先に返す ―― 「BTNの20bb以下」のような具体的な知識があるなら、
 * 一般論より先に読ませたい。同数なら定義順(= Notion での並び順)を保つ。
 */
export function matchKnowledge(
  decision: ReviewedDecision,
  entries: readonly KnowledgeEntry[],
  limit: number = MAX_NOTES_PER_DECISION
): KnowledgeEntry[] {
  const hit = entries
    .map((entry, index) => ({ entry, index, score: specificity(entry.when) }))
    .filter(({ entry }) => matches(entry, decision))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return hit.slice(0, Math.max(0, limit)).map(({ entry }) => entry);
}
