import { eliteFrameOf, type EliteFrame, type EliteStats } from "@meta-geo/engine";
import { computeRRRatings } from "./rrRating.js";
import { getRankedEntries } from "./rankedEntries.js";

/**
 * High Roller / Super High Roller の参加資格と、アイコンの銀枠・金枠。
 *
 * 生涯収支・偏差値・ROI は、ランキング・偏差値と同じ「順位が確定した実プレイヤーのエントリー」
 * (getRankedEntries の共有キャッシュ)から求める。成績画面の値と一致させるため、収支 = 賞金 − 参加費、
 * ROI(%) = (賞金 ÷ 参加費 − 1) × 100。
 *
 * 自動で卓を埋めるプレイヤーは集計の対象外なので、枠は常に無し。人間にも枠の無い人は多数いるので、
 * 枠の有無から種別は分からない(応答の形も全員同じ)。
 */
export async function getEliteStatsMap(): Promise<Map<string, EliteStats>> {
  const [entries, ratings] = await Promise.all([getRankedEntries(), computeRRRatings()]);
  const totals = new Map<string, { buyIn: number; payout: number }>();
  for (const e of entries) {
    const t = totals.get(e.userId) ?? { buyIn: 0, payout: 0 };
    t.buyIn += e.buyIn;
    t.payout += e.payout;
    totals.set(e.userId, t);
  }
  const ratingBy = new Map(ratings.map((r) => [r.userId, r.rrRating]));
  const out = new Map<string, EliteStats>();
  for (const [userId, t] of totals) {
    out.set(userId, {
      profit: t.payout - t.buyIn,
      rating: ratingBy.get(userId) ?? null,
      roiPct: t.buyIn > 0 ? (t.payout / t.buyIn - 1) * 100 : null,
    });
  }
  return out;
}

const NO_STATS: EliteStats = { profit: 0, rating: null, roiPct: null };

export async function getEliteStats(userId: string): Promise<EliteStats> {
  return (await getEliteStatsMap()).get(userId) ?? NO_STATS;
}

/** 複数人の枠をまとめて引く(卓の6人、ランキングの一覧など)。 */
export async function getEliteFrames(userIds: readonly string[]): Promise<Map<string, EliteFrame | null>> {
  const stats = await getEliteStatsMap();
  return new Map(userIds.map((id) => [id, eliteFrameOf(stats.get(id) ?? NO_STATS)]));
}
