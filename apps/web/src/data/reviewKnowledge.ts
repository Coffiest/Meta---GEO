import type { KnowledgeEntry } from "@/lib/reviewKnowledge";

/**
 * 棋譜解析に添える、オーナーのポーカー知識。
 *
 * 出どころは Notion。**開発時に取り込む**(実行時に Notion を読みにいかない)ので、
 * Notion を更新したら取り込み直しが要る。取り込みは人手で読んで、下の形に落とす。
 *
 * ## 書き方
 *
 * `when` に**書いた条件だけ**が判定される。書かなかった項目は「問わない」。
 * 全部省略すれば、あらゆる決定に当てはまる一般論になる。
 *
 * ```ts
 * {
 *   id: "short-stack-btn-open",
 *   title: "20bb以下のBTNオープン",
 *   body: "ここにオーナーの文章をそのまま入れる。加工しない。",
 *   sourceUrl: "https://www.notion.so/...",
 *   when: {
 *     street: ["preflop"],
 *     heroPos: ["BTN"],
 *     effStackBb: { max: 20 },   // 20bb未満(境界は含まない)
 *   },
 * }
 * ```
 *
 * ## 並び順
 *
 * 条件の数が多いものが先に出る(具体的な知識を一般論より優先する)。同数のときは
 * **この配列の順**になるので、Notion での並び順をそのまま保つとよい。
 *
 * ## 注意
 *
 * - JSON ではなく TS にしてあるのは、ポジション名や格付け名を打ち間違えたときに
 *   型検査で止めるため。JSON だと黙って一生マッチしない項目ができてしまう。
 * - 1つの決定に出るのは最大2件(`MAX_NOTES_PER_DECISION`)。溢れた分は出ない。
 * - 文章はクライアントのバンドルに載る。合計が 100KB を超えてきたら、
 *   Route Handler 経由に移すかストリート別に分割すること。
 */
export const REVIEW_KNOWLEDGE: readonly KnowledgeEntry[] = [
  // Notion から取り込んだ知識をここに並べる。
];
