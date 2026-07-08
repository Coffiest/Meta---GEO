import { prisma } from "./client.js";

/**
 * 収支(バンクロール)はTenFourPokerと同様の「±方式」: 残高という疑似通貨を貯める仕組みではなく、
 * バイイン(-)と賞金(+)の累計をプラスマイナスの収支として表示する。台帳(BankrollTransaction)は
 * その導出元として引き続き1本で管理する(残高キャッシュは持たない)。
 */

/**
 * Supabase AuthのauthIdに対応するUserを取得し、無ければ作成する(初回ログイン時)。
 * 新規ユーザーは未オンボーディング状態(onboarded=false)で作られ、名前+アバターを
 * 設定するまでロビーには入れない。
 */
export async function getOrCreateUserByAuthId(params: {
  authId: string;
  email: string | null;
  displayName: string;
}): Promise<{ id: string; displayName: string; avatarKey: string | null; onboarded: boolean; isNew: boolean }> {
  const existing = await prisma.user.findUnique({ where: { authId: params.authId } });
  if (existing) {
    return {
      id: existing.id,
      displayName: existing.displayName,
      avatarKey: existing.avatarKey,
      onboarded: existing.onboarded,
      isNew: false,
    };
  }

  const user = await prisma.user.create({
    data: { authId: params.authId, email: params.email, displayName: params.displayName, isBot: false },
  });
  return { id: user.id, displayName: user.displayName, avatarKey: user.avatarKey, onboarded: user.onboarded, isNew: true };
}

/** オンボーディング(名前+アイコン)を保存し、完了フラグを立てる。アイコンは任意(未設定はnull)。 */
export async function completeOnboarding(params: {
  userId: string;
  displayName: string;
  avatarKey: string | null;
}): Promise<void> {
  await prisma.user.update({
    where: { id: params.userId },
    data: { displayName: params.displayName, avatarKey: params.avatarKey, onboarded: true },
  });
}

/** 累計収支(賞金合計 - バイイン合計)。±で表示するための値。 */
export async function getNetProfit(userId: string): Promise<number> {
  const result = await prisma.bankrollTransaction.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

/**
 * バイイン(参加費)を台帳に記帳する。±方式のため「残高不足で参加できない」状態は存在せず、
 * 収支がマイナスに沈むだけ(TenFourPokerと同じく参加自体は常に可能)。
 */
export async function recordBuyIn(params: { userId: string; tournamentId: string; amount: number }): Promise<void> {
  if (params.amount <= 0) return;
  await prisma.bankrollTransaction.create({
    data: {
      userId: params.userId,
      tournamentId: params.tournamentId,
      amount: -params.amount,
      kind: "buyIn",
    },
  });
}

/** トーナメント成績に応じた賞金を台帳に記帳する(0なら記帳しない)。 */
export async function recordPayout(params: { userId: string; tournamentId: string; amount: number }): Promise<void> {
  if (params.amount <= 0) return;
  await prisma.bankrollTransaction.create({
    data: {
      userId: params.userId,
      tournamentId: params.tournamentId,
      amount: params.amount,
      kind: "payout",
    },
  });
}

export interface PlayerStats {
  tournamentsPlayed: number;
  itmCount: number;
  /** イン・ザ・マネー率(0-1) */
  itmRate: number;
  totalBuyIns: number;
  totalPayouts: number;
  /** 収支(総payout - 総buyin)。±方式のメイン指標。 */
  profit: number;
  /** ROI = 得た金額 / かけた金額 (buyinが0なら0)。TenFour方式で「1.5倍で返ってきたら150%」の還元率表記。 */
  roi: number;
  /** 全国ランク(収支順、1始まり)。対象トーナメントが無ければnull。 */
  nationalRank: number | null;
  /** ランキング対象の総プレイヤー数 */
  totalRankedPlayers: number;
  vpipCount: number;
  vpipOpportunities: number;
  /** VPIP(0-1) */
  vpipRate: number;
  pfrCount: number;
  pfrOpportunities: number;
  /** PFR(0-1) */
  pfrRate: number;
  threeBetCount: number;
  threeBetOpportunities: number;
  /** 3Bet(0-1) */
  threeBetRate: number;
}

const AGGRESSIVE_KINDS = new Set(["bet", "raise", "allIn"]);

interface PreflopStats {
  vpipCount: number;
  vpipOpportunities: number;
  pfrCount: number;
  pfrOpportunities: number;
  threeBetCount: number;
  threeBetOpportunities: number;
}

/**
 * VPIP/PFR/3Betをプリフロップのアクションログから集計する。
 *  - VPIP: プリフロップで自発的にチップを投入した割合(コール or レイズ / 参加した全ハンド)
 *  - PFR:  プリフロップでレイズした割合(レイズ / 参加した全ハンド)
 *  - 3Bet: 最初のレイズに対してリレイズをした割合(リレイズ / 自分の前にレイズが1回だけあったハンド)
 * VPIP・PFRとも、BBがアンレイズドポットでチェックしたハンド(意思決定の余地が無い)は
 * 回数・機会のどちらにも含めない(実測のプレイスタイルとして意味を持たないため)。
 */
async function getPreflopStats(userId: string): Promise<PreflopStats> {
  const seats = await prisma.handSeat.findMany({
    where: { userId },
    select: {
      seatIndex: true,
      isBigBlind: true,
      hand: {
        select: {
          actions: {
            where: { street: "preflop" },
            orderBy: { sequenceNumber: "asc" },
            select: { seatIndex: true, kind: true },
          },
        },
      },
    },
  });

  let vpipCount = 0;
  let vpipOpportunities = 0;
  let pfrCount = 0;
  let pfrOpportunities = 0;
  let threeBetCount = 0;
  let threeBetOpportunities = 0;

  for (const seat of seats) {
    const actions = seat.hand.actions.filter((a) => a.kind !== "postBlind" && a.kind !== "postAnte");
    let raisesSoFar = 0;
    let firstOwnAction: { kind: string } | null = null;
    let raisesBeforeFirstOwnAction = 0;

    for (const action of actions) {
      if (action.seatIndex === seat.seatIndex) {
        firstOwnAction = action;
        raisesBeforeFirstOwnAction = raisesSoFar;
        break;
      }
      if (AGGRESSIVE_KINDS.has(action.kind)) raisesSoFar++;
    }

    if (!firstOwnAction) continue;

    const isBbFreeCheck = seat.isBigBlind && raisesBeforeFirstOwnAction === 0 && firstOwnAction.kind === "check";
    if (!isBbFreeCheck) {
      vpipOpportunities++;
      pfrOpportunities++;
      if (firstOwnAction.kind === "call" || AGGRESSIVE_KINDS.has(firstOwnAction.kind)) vpipCount++;
      if (AGGRESSIVE_KINDS.has(firstOwnAction.kind)) pfrCount++;
    }

    if (raisesBeforeFirstOwnAction === 1) {
      threeBetOpportunities++;
      if (firstOwnAction.kind === "raise" || firstOwnAction.kind === "allIn") threeBetCount++;
    }
  }

  return { vpipCount, vpipOpportunities, pfrCount, pfrOpportunities, threeBetCount, threeBetOpportunities };
}

/** ROI・収支・イン・ザ・マネー率・VPIP/PFR/3Bet・全国ランクなどのロビー用サマリースタッツ。 */
export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  const [entries, leaderboard, preflop] = await Promise.all([
    prisma.tournamentEntry.findMany({
      where: { userId, tournament: { status: "finished" } },
      select: { payout: true, tournament: { select: { buyIn: true } } },
    }),
    getLeaderboard(100000),
    getPreflopStats(userId),
  ]);

  const tournamentsPlayed = entries.length;
  const itmCount = entries.filter((e) => e.payout > 0).length;
  const totalBuyIns = entries.reduce((sum, e) => sum + e.tournament.buyIn, 0);
  const totalPayouts = entries.reduce((sum, e) => sum + e.payout, 0);
  const profit = totalPayouts - totalBuyIns;
  const rankIndex = leaderboard.findIndex((r) => r.userId === userId);

  return {
    tournamentsPlayed,
    itmCount,
    itmRate: tournamentsPlayed > 0 ? itmCount / tournamentsPlayed : 0,
    totalBuyIns,
    totalPayouts,
    profit,
    roi: totalBuyIns > 0 ? totalPayouts / totalBuyIns : 0,
    nationalRank: rankIndex === -1 ? null : rankIndex + 1,
    totalRankedPlayers: leaderboard.length,
    vpipCount: preflop.vpipCount,
    vpipOpportunities: preflop.vpipOpportunities,
    vpipRate: preflop.vpipOpportunities > 0 ? preflop.vpipCount / preflop.vpipOpportunities : 0,
    pfrCount: preflop.pfrCount,
    pfrOpportunities: preflop.pfrOpportunities,
    pfrRate: preflop.pfrOpportunities > 0 ? preflop.pfrCount / preflop.pfrOpportunities : 0,
    threeBetCount: preflop.threeBetCount,
    threeBetOpportunities: preflop.threeBetOpportunities,
    threeBetRate: preflop.threeBetOpportunities > 0 ? preflop.threeBetCount / preflop.threeBetOpportunities : 0,
  };
}

export interface TournamentResultPoint {
  /** 時系列インデックス(1始まり、古い順) */
  index: number;
  tournamentId: string;
  finishedAt: string;
  buyIn: number;
  /** そのトーナメントで得た賞金(入賞していなければ0) */
  payout: number;
  /** そのトーナメント単体のROI(%)。payout/buyIn*100。 */
  roi: number;
}

/**
 * 獲得金額・ROIの棒グラフ用データ(トーナメントごと・時系列)。
 * 直近limit件を古い順に並べ替えて返す。
 */
export async function getTournamentResultsGraph(userId: string, limit = 30): Promise<TournamentResultPoint[]> {
  const entries = await prisma.tournamentEntry.findMany({
    where: { userId, tournament: { status: "finished" } },
    orderBy: { tournament: { finishedAt: "desc" } },
    take: limit,
    select: {
      payout: true,
      tournament: { select: { id: true, buyIn: true, finishedAt: true, createdAt: true } },
    },
  });

  return entries
    .reverse()
    .map((e, i) => ({
      index: i + 1,
      tournamentId: e.tournament.id,
      finishedAt: (e.tournament.finishedAt ?? e.tournament.createdAt).toISOString(),
      buyIn: e.tournament.buyIn,
      payout: e.payout,
      roi: e.tournament.buyIn > 0 ? Math.round((e.payout / e.tournament.buyIn) * 1000) / 10 : 0,
    }));
}

export interface LeaderboardRow {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  profit: number;
  roi: number;
  tournamentsPlayed: number;
}

/**
 * 全プレイヤー(実ユーザーのみ、BOT除外)の収支ランキング。
 * 終了済みトーナメントのバイイン/賞金から集計する。
 */
export async function getLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  const entries = await prisma.tournamentEntry.findMany({
    where: { tournament: { status: "finished" }, user: { isBot: false } },
    select: {
      payout: true,
      tournament: { select: { buyIn: true } },
      user: { select: { id: true, displayName: true, avatarKey: true } },
    },
  });

  const byUser = new Map<string, LeaderboardRow & { totalBuyIns: number }>();
  for (const e of entries) {
    let row = byUser.get(e.user.id);
    if (!row) {
      row = {
        userId: e.user.id,
        displayName: e.user.displayName,
        avatarKey: e.user.avatarKey,
        profit: 0,
        roi: 0,
        tournamentsPlayed: 0,
        totalBuyIns: 0,
      };
      byUser.set(e.user.id, row);
    }
    row.tournamentsPlayed += 1;
    row.totalBuyIns += e.tournament.buyIn;
    row.profit += e.payout - e.tournament.buyIn;
  }

  return [...byUser.values()]
    .map((r) => ({ ...r, roi: r.totalBuyIns > 0 ? r.profit / r.totalBuyIns : 0 }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, limit)
    .map(({ totalBuyIns: _totalBuyIns, ...row }) => row);
}

export interface HandHistoryRow {
  handId: string;
  playedAt: Date;
  position: string;
  holeCards: string[];
  board: string[];
  /** ヒーローの収支(チップ) */
  deltaChips: number;
  bigBlind: number;
}

const POSITION_TABLE_6MAX = ["BTN", "SB", "BB", "UTG", "HJ", "CO"];

/** 指定ユーザーのハンド履歴(TenFourのHand History画面相当)。新しい順。 */
export async function getUserHandHistory(userId: string, limit = 100): Promise<HandHistoryRow[]> {
  const seats = await prisma.handSeat.findMany({
    where: { userId },
    orderBy: { hand: { createdAt: "desc" } },
    take: limit,
    include: {
      hand: {
        select: {
          id: true,
          createdAt: true,
          board: true,
          buttonFixedPos: true,
          levelBigBlind: true,
          tournament: { select: { seatCount: true } },
        },
      },
    },
  });

  return seats.map((s) => {
    const seatCount = s.hand.tournament.seatCount;
    const offset = (((s.seatIndex - s.hand.buttonFixedPos) % seatCount) + seatCount) % seatCount;
    return {
      handId: s.hand.id,
      playedAt: s.hand.createdAt,
      position: POSITION_TABLE_6MAX[offset] ?? `+${offset}`,
      holeCards: s.holeCards,
      board: s.hand.board,
      deltaChips: s.resultStackDelta,
      bigBlind: s.hand.levelBigBlind,
    };
  });
}

export interface PayoutPlace {
  place: number;
  amount: number;
}

/**
 * SNGの固定プライズ: 常に上位2名インマネ、1位$4,000 / 2位$2,000
 * (6人 × バイイン$1,000 = プール$6,000、還元率100%)。
 */
export const SNG_PAYOUTS: PayoutPlace[] = [
  { place: 1, amount: 4000 },
  { place: 2, amount: 2000 },
];

export interface MttPrizeStructure {
  fieldSize: number;
  prizePool: number;
  places: PayoutPlace[];
}

/**
 * WSOPメインイベント準拠のMTTプライズ構造。
 *  - 還元率93%(WSOP $10Kバイインのうち$9,300がプールに入るのと同率)
 *  - 入賞はフィールドの上位15%(最低2名)
 *  - ミニマムキャッシュはバイインの約1.5倍(2025年ME: $10Kバイインで$15,000ミンキャッシュ)
 *  - 上位はべき乗則で減衰(大規模フィールドで1位がプールの11〜15%になるWSOPの実カーブに近似)
 *  - 2名入賞の小規模フィールドは65/35
 */
export function computeMttPrizeStructure(fieldSize: number, buyIn: number): MttPrizeStructure {
  const prizePool = Math.round((fieldSize * buyIn * 0.93) / 10) * 10;
  if (fieldSize <= 1 || prizePool <= 0) return { fieldSize, prizePool: 0, places: [] };

  const paidPlaces = Math.max(2, Math.round(fieldSize * 0.15));
  const minCash = Math.round((buyIn * 1.5) / 10) * 10;

  if (paidPlaces === 2) {
    const first = Math.round((prizePool * 0.65) / 10) * 10;
    return {
      fieldSize,
      prizePool,
      places: [
        { place: 1, amount: first },
        { place: 2, amount: prizePool - first },
      ],
    };
  }

  // べき乗則ウェイト(指数1.45)で配分し、ミニマムキャッシュ未満の着順を底上げして
  // 残りを上位に再配分する。
  const weights = Array.from({ length: paidPlaces }, (_, i) => Math.pow(i + 1, -1.45));
  let amounts: number[] = [];
  let floorTotal = 0;
  let flooredFrom = paidPlaces; // このインデックス以降はminCash固定
  for (let iter = 0; iter < paidPlaces; iter++) {
    const remainingPool = prizePool - floorTotal;
    const wSum = weights.slice(0, flooredFrom).reduce((a, b) => a + b, 0);
    amounts = weights.slice(0, flooredFrom).map((w) => Math.round(((remainingPool * w) / wSum) / 10) * 10);
    const firstBelow = amounts.findIndex((a) => a < minCash);
    if (firstBelow === -1) break;
    floorTotal = (paidPlaces - firstBelow) * minCash;
    flooredFrom = firstBelow;
  }
  const places: PayoutPlace[] = [];
  for (let i = 0; i < paidPlaces; i++) {
    places.push({ place: i + 1, amount: i < flooredFrom ? amounts[i]! : minCash });
  }
  // 丸め誤差は1位に吸収させ、合計をプールと厳密に一致させる
  const distributed = places.reduce((sum, p) => sum + p.amount, 0);
  places[0]!.amount += prizePool - distributed;

  return { fieldSize, prizePool, places };
}

/** 後方互換: SNG用途で使われていた旧APIをSNG固定プライズへ委譲する。 */
export function computePayoutStructure(fieldSize: number, buyIn: number): PayoutPlace[] {
  if (fieldSize <= 1) return [];
  if (fieldSize <= 6 && buyIn <= 1000) return SNG_PAYOUTS.slice(0, Math.min(2, fieldSize));
  return computeMttPrizeStructure(fieldSize, buyIn).places;
}
