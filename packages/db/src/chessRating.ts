import { prisma } from "./client.js";

/**
 * レート(chess.com と同じ Glicko 方式・同じ単位。オーナー指示 2026-11-14)。トナメ偏差値とは別物。
 *
 * - 全員 1200・RD 350 から始める(chess.com の以前の初期値)。
 * - SNG・MTT・High Roller を1本のレートで数える(フレンド対戦は数えない。`RANKED_TOURNAMENT` と同じ)。
 * - 1トーナメント = 1局。**賞金が出た(入賞)= 勝ち、出なかった = 負け**(オーナー確定)。
 *   相手は「同じトーナメントのほかの参加者全員」を1人にまとめたもの(レートは平均、RD は二乗平均)。
 * - 自動の席も人間と同じレートを持ち、同じ計算で動く(種別で分岐しない)。
 *
 * Glicko(Glickman, 1999)の1局の更新式そのまま。遊んでいない間は RD がゆっくり戻る(1日ごとに c² を足す)。
 */
export const RATING_START = 1200;
export const RD_START = 350;
export const RD_MIN = 30;
/** 遊ばない日が続くと RD が戻る速さ(約1年で 50 → 350)。 */
const C = Math.sqrt((RD_START ** 2 - 50 ** 2) / 365);
const Q = Math.log(10) / 400;

const g = (rd: number) => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));

/** 遊んでいなかった日数ぶん RD を戻す。 */
export function decayRd(rd: number, lastAt: Date | null, now = new Date()): number {
  if (!lastAt) return rd;
  const days = Math.max(0, (now.getTime() - lastAt.getTime()) / 86_400_000);
  return Math.min(RD_START, Math.sqrt(rd * rd + C * C * days));
}

/** Glicko の1局の更新。score は 1 = 勝ち / 0 = 負け。 */
export function glickoUpdate(
  me: { rating: number; rd: number },
  opp: { rating: number; rd: number },
  score: 0 | 1,
): { rating: number; rd: number } {
  const gj = g(opp.rd);
  const e = 1 / (1 + Math.pow(10, (-gj * (me.rating - opp.rating)) / 400));
  const d2 = 1 / (Q * Q * gj * gj * e * (1 - e));
  const denom = 1 / (me.rd * me.rd) + 1 / d2;
  const rating = me.rating + (Q / denom) * gj * (score - e);
  const rd = Math.max(RD_MIN, Math.sqrt(1 / denom));
  return { rating, rd };
}

/** 複数人のレートを読む(席の表示用)。見つからない人は 1200。 */
export async function getRatings(userIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, rating: true } });
  const map = new Map(rows.map((r) => [r.id, Math.round(r.rating)]));
  for (const id of ids) if (!map.has(id)) map.set(id, RATING_START);
  return map;
}

/**
 * 1人ぶんの着順が確定したときに呼ぶ。入賞なら勝ち、それ以外は負け。
 * 前後のレートを参加の行に残し、{ before, after } を返す(結果画面のアニメーション用)。
 * 同じ参加に2回呼ばれても、2回目は何もしない(ratingAfter が入っていれば済み)。
 */
export async function applyTournamentRating(
  tournamentId: string,
  userId: string,
  won: boolean,
): Promise<{ before: number; after: number } | null> {
  const entry = await prisma.tournamentEntry.findFirst({
    where: { tournamentId, userId, ratingAfter: null },
    select: { id: true },
    orderBy: { seatIndex: "asc" },
  });
  if (!entry) return null;
  const others = await prisma.tournamentEntry.findMany({
    where: { tournamentId, userId: { not: userId } },
    select: { user: { select: { rating: true, ratingRd: true } } },
  });
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { rating: true, ratingRd: true, ratingAt: true } });
  if (!me || others.length === 0) return null;
  const opp = {
    rating: others.reduce((s, o) => s + o.user.rating, 0) / others.length,
    rd: Math.sqrt(others.reduce((s, o) => s + o.user.ratingRd ** 2, 0) / others.length),
  };
  const now = new Date();
  const next: { rating: number; rd: number } = glickoUpdate({ rating: me.rating, rd: decayRd(me.ratingRd, me.ratingAt, now) }, opp, won ? 1 : 0);
  const before = Math.round(me.rating);
  // インマネした人だけ上がる(オーナー指示)。丸めで向きが逆にならないよう、入賞は +1 以上、それ以外は ±0 以下に止める。
  const rawAfter = Math.round(next.rating);
  const after = won ? Math.max(before + 1, rawAfter) : Math.min(before, rawAfter);
  if (after !== rawAfter) next.rating = after;
  await prisma.user.update({ where: { id: userId }, data: { rating: next.rating, ratingRd: next.rd, ratingAt: now }, select: { id: true } });
  await prisma.tournamentEntry.update({ where: { id: entry.id }, data: { ratingBefore: before, ratingAfter: after }, select: { id: true } });
  return { before, after };
}
