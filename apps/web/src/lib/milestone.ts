/**
 * 結果画面で「節目に到達した瞬間」を検出するロジック。
 * トーナメント開始時のスナップショット(before)と終了後(after)を比べ、
 * 今回のトーナメントで初めて超えた節目だけを返す(無ければ null)。
 *
 * 自慢したくなる瞬間を作ってワンタップでシェアさせる、というバイラル設計の要。
 */

import type { ResultStatsSnapshot } from "@/components/TournamentResultScreen";

/** 通算参加トーナメント数の節目。 */
const TOURNAMENT_STEPS = [1, 10, 25, 50, 100, 250, 500, 1000] as const;

/** 全国順位の節目(内側=より上位)。 */
const RANK_STEPS = [100, 50, 10, 3, 1] as const;

export interface Milestone {
  /** 到達種別。参加数の節目か、全国順位の節目か。 */
  kind: "tournaments" | "rank";
  /** 節目の数値(参加数なら100、順位ならTOP10の10)。 */
  n: number;
  /** ランキング母数(順位の節目のときだけ意味を持つ)。 */
  totalRankedPlayers: number;
  /** バナー/カードの主役表示(例: "100" / "TOP 10" / "全国 1 位")。 */
  headline: string;
  /** 主役の下に添える説明(例: "通算トーナメント参加数")。 */
  caption: string;
}

/** 参加数の節目を今回のトーナメントで超えたか。 */
function detectTournamentMilestone(before: ResultStatsSnapshot, after: ResultStatsSnapshot): Milestone | null {
  const from = before.tournamentsPlayed;
  const to = after.tournamentsPlayed;
  if (to <= from) return null;
  // 一度に複数の節目を跨ぐことは無いが、跨いだ場合は大きい方を採用する。
  const hit = [...TOURNAMENT_STEPS].reverse().find((step) => from < step && step <= to);
  if (hit === undefined) return null;
  return {
    kind: "tournaments",
    n: hit,
    totalRankedPlayers: after.totalRankedPlayers,
    headline: hit === 1 ? "初トーナメント" : `${hit.toLocaleString()} 戦`,
    caption: hit === 1 ? "Poker ARTデビュー" : "通算トーナメント参加数",
  };
}

/** 全国順位の節目に今回初めて入ったか。 */
function detectRankMilestone(before: ResultStatsSnapshot, after: ResultStatsSnapshot): Milestone | null {
  const to = after.nationalRank;
  if (to == null) return null;
  const from = before.nationalRank;
  // 母数が節目に満たないランキングでの「TOP◯◯入り」は意味を持たないので出さない。
  const total = after.totalRankedPlayers;
  const hit = RANK_STEPS.find(
    (step) => to <= step && (from == null || from > step) && total >= Math.max(step, 2),
  );
  if (hit === undefined) return null;
  return {
    kind: "rank",
    n: hit,
    totalRankedPlayers: total,
    headline: hit === 1 ? "全国 1 位" : `全国 TOP ${hit}`,
    caption: `${total.toLocaleString()} 人中`,
  };
}

/**
 * 今回のトーナメントで到達した節目を1つだけ返す。
 * 順位の節目の方が価値が高いので、両方に該当したときは順位を優先する。
 */
export function detectMilestone(
  before: ResultStatsSnapshot | null,
  after: ResultStatsSnapshot | null,
): Milestone | null {
  if (!before || !after) return null;
  return detectRankMilestone(before, after) ?? detectTournamentMilestone(before, after);
}

/** マイルストーンのシェア本文。 */
export function buildMilestoneShareText(m: Milestone): string {
  if (m.kind === "rank") {
    return m.n === 1
      ? "Poker ARTで全国1位になりました。"
      : `Poker ARTで全国TOP${m.n}に入りました。`;
  }
  if (m.n === 1) return "Poker ARTでポーカーデビューしました。";
  return `Poker ARTで通算${m.n.toLocaleString()}トーナメントに到達しました。`;
}
