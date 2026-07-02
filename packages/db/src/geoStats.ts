import { prisma } from "./client.js";

const POSITION_NAMES_BY_SEAT_COUNT: Record<number, readonly string[]> = {
  // オフセット(座席 - ボタン座席, mod seatCount)ごとのポジション名。0=ボタン。
  2: ["BTN/SB", "BB"],
  6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
};

function positionNameForOffset(seatCount: number, offset: number): string {
  const names = POSITION_NAMES_BY_SEAT_COUNT[seatCount];
  return names?.[offset] ?? `seat+${offset}`;
}

export interface PositionalRfiStat {
  readonly position: string;
  /** そのポジションで「まだ誰もレイズしていない状態で自分の番が回ってきた」回数 */
  readonly opportunities: number;
  readonly raises: number;
  readonly limps: number;
  readonly checks: number;
  readonly folds: number;
}

/**
 * ポジション別の「オープンレイズ頻度(RFI: Raise First In)」を集計する。
 * GEO戦略の第一歩として、実際のプレイヤー母集団がポジションごとにどれくらいの頻度で
 * オープンレイズ/リンプ/フォールドしているかを可視化する。
 *
 * 注: 現時点ではGTOベースラインとの比較は行わない(ソルバー未実装のため、根拠のない
 * 「GTO値」を表示して誤解を招くことを避ける)。実測値(母集団の傾向)のみを提供する。
 */
export async function getPositionalRfiStats(seatCount = 6): Promise<PositionalRfiStat[]> {
  const hands = await prisma.hand.findMany({
    select: {
      buttonFixedPos: true,
      actions: {
        where: { street: "preflop" },
        orderBy: { sequenceNumber: "asc" },
        select: { seatIndex: true, kind: true },
      },
    },
  });

  const tally = new Map<string, { opportunities: number; raises: number; limps: number; checks: number; folds: number }>();
  const ensure = (position: string) => {
    let entry = tally.get(position);
    if (!entry) {
      entry = { opportunities: 0, raises: 0, limps: 0, checks: 0, folds: 0 };
      tally.set(position, entry);
    }
    return entry;
  };

  for (const hand of hands) {
    let raiseHasOccurred = false;
    const seenSeats = new Set<number>();

    for (const action of hand.actions) {
      if (action.kind === "postBlind" || action.kind === "postAnte") continue;

      const isFirstActionForSeat = !seenSeats.has(action.seatIndex);
      seenSeats.add(action.seatIndex);

      if (isFirstActionForSeat && !raiseHasOccurred) {
        const offset = (((action.seatIndex - hand.buttonFixedPos) % seatCount) + seatCount) % seatCount;
        const position = positionNameForOffset(seatCount, offset);
        const stat = ensure(position);
        stat.opportunities++;
        switch (action.kind) {
          case "raise":
          case "bet":
          case "allIn":
            stat.raises++;
            break;
          case "call":
            stat.limps++;
            break;
          case "check":
            stat.checks++;
            break;
          case "fold":
            stat.folds++;
            break;
        }
      }

      if (action.kind === "raise" || action.kind === "bet" || action.kind === "allIn") {
        raiseHasOccurred = true;
      }
    }
  }

  const names = POSITION_NAMES_BY_SEAT_COUNT[seatCount] ?? [];
  return names.map((position) => {
    const s = tally.get(position) ?? { opportunities: 0, raises: 0, limps: 0, checks: 0, folds: 0 };
    return { position, ...s };
  });
}

export interface GeoSummaryStats {
  readonly totalHands: number;
  readonly totalPlayers: number;
  readonly totalTournaments: number;
  readonly averagePot: number;
  readonly showdownRate: number;
}

export async function getGeoSummaryStats(): Promise<GeoSummaryStats> {
  const [totalHands, totalPlayers, totalTournaments, potAgg, wonByFoldCount] = await Promise.all([
    prisma.hand.count(),
    prisma.user.count({ where: { isBot: false } }),
    prisma.tournament.count(),
    prisma.hand.aggregate({ _avg: { potTotal: true } }),
    prisma.hand.count({ where: { wonByFold: true } }),
  ]);

  const showdownRate = totalHands > 0 ? (totalHands - wonByFoldCount) / totalHands : 0;

  return {
    totalHands,
    totalPlayers,
    totalTournaments,
    averagePot: Math.round(potAgg._avg.potTotal ?? 0),
    showdownRate,
  };
}

export interface RecentHandSummary {
  readonly id: string;
  readonly handNumber: number;
  readonly createdAt: Date;
  readonly board: string[];
  readonly potTotal: number;
  readonly wonByFold: boolean;
  readonly seatCount: number;
}

export async function getRecentHands(limit = 20, offset = 0): Promise<RecentHandSummary[]> {
  const hands = await prisma.hand.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    include: { _count: { select: { seats: true } } },
  });

  return hands.map((h) => ({
    id: h.id,
    handNumber: h.handNumber,
    createdAt: h.createdAt,
    board: h.board,
    potTotal: h.potTotal,
    wonByFold: h.wonByFold,
    seatCount: h._count.seats,
  }));
}

export interface HandDetail {
  readonly id: string;
  readonly handNumber: number;
  readonly board: string[];
  readonly potTotal: number;
  readonly wonByFold: boolean;
  readonly levelSmallBlind: number;
  readonly levelBigBlind: number;
  readonly seats: {
    seatIndex: number;
    displayName: string;
    holeCards: string[];
    isSmallBlind: boolean;
    isBigBlind: boolean;
    resultStackDelta: number;
  }[];
  readonly actions: {
    seatIndex: number;
    street: string;
    kind: string;
    toAmount: number | null;
    potBefore: number;
  }[];
}

export async function getHandDetail(handId: string): Promise<HandDetail | null> {
  const hand = await prisma.hand.findUnique({
    where: { id: handId },
    include: {
      seats: { include: { user: true }, orderBy: { seatIndex: "asc" } },
      actions: { orderBy: { sequenceNumber: "asc" } },
    },
  });
  if (!hand) return null;

  return {
    id: hand.id,
    handNumber: hand.handNumber,
    board: hand.board,
    potTotal: hand.potTotal,
    wonByFold: hand.wonByFold,
    levelSmallBlind: hand.levelSmallBlind,
    levelBigBlind: hand.levelBigBlind,
    seats: hand.seats.map((s) => ({
      seatIndex: s.seatIndex,
      displayName: s.user.displayName,
      holeCards: s.holeCards,
      isSmallBlind: s.isSmallBlind,
      isBigBlind: s.isBigBlind,
      resultStackDelta: s.resultStackDelta,
    })),
    actions: hand.actions.map((a) => ({
      seatIndex: a.seatIndex,
      street: a.street,
      kind: a.kind,
      toAmount: a.toAmount,
      potBefore: a.potBefore,
    })),
  };
}
