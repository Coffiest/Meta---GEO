import { prisma } from "./client.js";

/**
 * 偏差値(RRRating)とリーダーボードが共通して必要とする「順位が確定した実プレイヤーのエントリー」を
 * 1回だけ取得し、ごく短時間だけ共有するキャッシュ。
 *
 * なぜ必要か:
 *  ホームを開くと 偏差値カード / バッジ図鑑 / リーダーボード が個別に全体集計を要求し、
 *  そのたびに TournamentEntry を全件フェッチしていた。プレイ数が増えるほど遅くなり続け、
 *  1コアのVMではその間イベントループも塞がる(= 体感の「重い・固まる」)。
 *  同じデータを何度も引かないだけで、ホーム表示のDB往復は3回以上→1回になる。
 *
 * 鮮度について:
 *  キャッシュは数秒で失効し、さらにトーナメント結果が確定した時点で明示的に破棄する
 *  (結果画面が偏差値の増減を出すため、古い値を返すと「増減0」に見えてしまう)。
 */

/** キャッシュの寿命。ホーム表示の同時多発呼び出しを1回にまとめるだけの短さに留める。 */
const CACHE_TTL_MS = 5_000;

export interface RankedEntryRow {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  buyIn: number;
  payout: number;
  /** 集計の時間軸(週次/直近N件)に使う確定時刻。finishedAtが無ければ作成時刻。 */
  finishedAtMs: number;
}

let cache: { at: number; rows: RankedEntryRow[] } | null = null;
/** 同時に走ったリクエストで同じフェッチを重複させないための共有Promise。 */
let inflight: Promise<RankedEntryRow[]> | null = null;

async function fetchRows(): Promise<RankedEntryRow[]> {
  const entries = await prisma.tournamentEntry.findMany({
    where: { finishPosition: { not: null }, user: { isBot: false } },
    select: {
      payout: true,
      tournament: { select: { buyIn: true, finishedAt: true, createdAt: true } },
      user: { select: { id: true, displayName: true, avatarKey: true } },
    },
  });
  return entries.map((e) => ({
    userId: e.user.id,
    displayName: e.user.displayName,
    avatarKey: e.user.avatarKey,
    buyIn: e.tournament.buyIn,
    payout: e.payout,
    finishedAtMs: (e.tournament.finishedAt ?? e.tournament.createdAt).getTime(),
  }));
}

/** 順位確定済みエントリー(実プレイヤーのみ)。短時間キャッシュ+同時リクエストの合流つき。 */
export async function getRankedEntries(): Promise<RankedEntryRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  if (inflight) return inflight;
  inflight = fetchRows()
    .then((rows) => {
      cache = { at: Date.now(), rows };
      return rows;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * キャッシュを破棄する。トーナメントの着順・払い出しが確定した直後に呼ぶこと
 * (結果画面が偏差値と全国順位の増減を表示するため、そこは必ず最新値で出す)。
 */
export function invalidateRankedEntries(): void {
  cache = null;
}
