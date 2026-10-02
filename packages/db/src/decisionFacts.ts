import {
  computeIcm,
  computePositionLabels,
  readBarrelCheckSpots,
  readBetRoles,
  readBoardTexture,
  readDecisionSpots,
  readHandStrength,
} from "@meta-geo/engine";
import { prisma } from "./client.js";
import { handClassLabel } from "./preflopBaseline.js";

/**
 * 研究用の「1アクション = 1行」(DecisionFact)を作る。データベースタブの「データ研究」で、
 * 思考時間・状況・その時点の優勝率/インマネ率・直前に大きいポットを取った/落とした、などの相関を
 * GROUP BY 1本で集計できるよう、帯(バケット)まで焼き込む。
 *
 * - `buildDecisionFacts` は DB 非依存の純関数(テスト可能)
 * - `rebuildDecisionFactsForHand` は1ハンドぶんを削除→挿入で作り直す(何度呼んでも同じ結果)
 * - `backfillDecisionFacts` は既存の全ハンドを作り直す(管理画面から起動)
 *
 * **人間の決定だけを行にする。** 自動で卓を埋めるプレイヤーの行はどこからも読まれない(研究の集計は人間だけが対象)
 * ので書かない。1人卓では行数が約1/4〜1/5になり、DB で最も大きいテーブルの増え方を抑える。
 * 自動プレイヤーも状況(残り人数・スタック・ICM)の計算には入れる。
 */

/** 「大きいポット」: 獲得/損失が、そのハンド開始時のスタックのこの割合以上 */
export const BIG_POT_STACK_SHARE = 0.5;
/** …または、この bb 以上。 */
export const BIG_POT_MIN_BB = 20;
/** 直前の流れとして読む、同じトーナメントの直近ハンドの数。 */
export const HISTORY_HANDS = 30;

export interface FactSeat {
  seatIndex: number;
  userId: string;
  isBot: boolean;
  startingStack: number;
  holeCards: string[];
  isSmallBlind: boolean;
  isBigBlind: boolean;
  resultStackDelta: number;
}

export interface FactAction {
  sequenceNumber: number;
  seatIndex: number;
  street: string;
  kind: string;
  toAmount: number | null;
  potBefore: number;
  thinkMs: number | null;
  timedOut: boolean;
  timeBankUsed: boolean;
}

/** そのプレイヤーの、同じトーナメントの直前のハンド(新しい順)。 */
export interface FactHistoryHand {
  handNumber: number;
  startingStack: number;
  resultStackDelta: number;
  bigBlind: number;
}

export interface FactHandInput {
  id: string;
  tournamentId: string;
  gameType: string;
  handNumber: number;
  buttonFixedPos: number;
  bigBlind: number;
  board: string[];
  wonByFold: boolean;
  startedAt: Date | null;
  tournamentCreatedAt: Date | null;
  tournamentStartingStack: number | null;
  playersRemaining: number | null;
  payouts: number[];
  fieldStacks: number[];
  seats: FactSeat[];
  actions: FactAction[];
  potWinners: string[][];
  history: Map<string, FactHistoryHand[]>;
}

export interface DecisionFactRow {
  handId: string;
  tournamentId: string;
  userId: string;
  gameType: string;
  handNumber: number;
  sequenceNumber: number;
  street: string;
  kind: string;
  actionClass: string;
  firstInHand: boolean;
  handVpip: boolean;
  handPfr: boolean;
  thinkMs: number | null;
  thinkBucket: string;
  timedOut: boolean;
  timeBankUsed: boolean;
  position: string;
  playersInHand: number;
  playersActive: number;
  bigBlind: number;
  potBb: number;
  facingBb: number | null;
  betSizePot: number | null;
  betSizeBucket: string;
  stackBb: number;
  effStackBb: number;
  stackBucket: string;
  spr: number | null;
  handClass: string | null;
  madeHand: string | null;
  hasDraw: boolean;
  boardTexture: string | null;
  spot: string;
  playersRemaining: number | null;
  itmPlaces: number | null;
  bubbleDistance: number | null;
  bubbleStage: string;
  stackRank: number | null;
  chipShare: number | null;
  winProb: number | null;
  itmProb: number | null;
  icmEquity: number | null;
  winProbBucket: string;
  itmProbBucket: string;
  prevHandDeltaBb: number | null;
  prevBigPot: string;
  handsSinceBigPot: number | null;
  lastBigPotKind: string;
  lossStreak: number;
  handIndexInTournament: number;
  minutesIntoTournament: number | null;
  stackVsStart: number | null;
  handResultBb: number;
  wentToShowdown: boolean;
  wonHand: boolean;
}

// ───────────────────────────── 帯(バケット) ─────────────────────────────
// 帯の名前は集計 API と画面がそのまま使う。並び順は `BUCKET_ORDER`(研究 API 側)で持つ。

export function thinkBucketOf(thinkMs: number | null, timedOut: boolean, timeBankUsed: boolean): string {
  if (timedOut) return "timeout";
  if (thinkMs === null) return "unknown";
  if (timeBankUsed) return "timebank";
  if (thinkMs < 2000) return "0-2s";
  if (thinkMs < 5000) return "2-5s";
  if (thinkMs < 10000) return "5-10s";
  if (thinkMs < 20000) return "10-20s";
  return "20s+";
}

export function stackBucketOfBb(bb: number): string {
  if (bb < 10) return "<10bb";
  if (bb < 20) return "10-20bb";
  if (bb < 40) return "20-40bb";
  if (bb < 80) return "40-80bb";
  return "80bb+";
}

export function betSizeBucketOf(frac: number | null, allIn: boolean): string {
  if (allIn) return "allIn";
  if (frac === null) return "none";
  if (frac < 0.33) return "<33%";
  if (frac < 0.5) return "33-50%";
  if (frac < 0.75) return "50-75%";
  if (frac <= 1.0) return "75-100%";
  return "100%+";
}

export function winProbBucketOf(p: number | null): string {
  if (p === null) return "unknown";
  if (p < 0.05) return "<5%";
  if (p < 0.15) return "5-15%";
  if (p < 0.3) return "15-30%";
  if (p < 0.5) return "30-50%";
  return "50%+";
}

export function itmProbBucketOf(p: number | null): string {
  if (p === null) return "unknown";
  if (p < 0.2) return "<20%";
  if (p < 0.4) return "20-40%";
  if (p < 0.6) return "40-60%";
  if (p < 0.8) return "60-80%";
  return "80%+";
}

export function bubbleStageOf(distance: number | null): string {
  if (distance === null) return "unknown";
  if (distance <= 0) return "itm";
  if (distance === 1) return "bubble";
  if (distance <= 3) return "nearBubble";
  return "early";
}

/** 直前のハンドが「大きいポット」だったか。 */
export function bigPotKindOf(h: FactHistoryHand): "win" | "loss" | null {
  const bb = h.bigBlind > 0 ? Math.abs(h.resultStackDelta) / h.bigBlind : 0;
  const share = h.startingStack > 0 ? Math.abs(h.resultStackDelta) / h.startingStack : 0;
  if (h.resultStackDelta === 0 || (bb < BIG_POT_MIN_BB && share < BIG_POT_STACK_SHARE)) return null;
  return h.resultStackDelta > 0 ? "win" : "loss";
}

const AGGRESSIVE = new Set(["bet", "raise", "allIn"]);
const DECISION_KINDS = new Set(["fold", "check", "call", "bet", "raise", "allIn"]);
const BOARD_LEN: Record<string, number> = { flop: 3, turn: 4, river: 5 };

function round(x: number, digits = 3): number {
  const m = Math.pow(10, digits);
  return Math.round(x * m) / m;
}

/** 1ハンドぶんの研究用の行を作る(純関数)。 */
export function buildDecisionFacts(h: FactHandInput): DecisionFactRow[] {
  const bb = h.bigBlind > 0 ? h.bigBlind : 1;
  const seatCount = Math.max(6, ...h.seats.map((s) => s.seatIndex + 1));
  const positions = computePositionLabels({
    seatIndexes: h.seats.map((s) => s.seatIndex),
    buttonFixedPos: h.buttonFixedPos,
    smallBlindSeat: h.seats.find((s) => s.isSmallBlind)?.seatIndex ?? null,
    bigBlindSeat: h.seats.find((s) => s.isBigBlind)?.seatIndex ?? h.seats[0]?.seatIndex ?? 0,
    seatCount,
  });
  const table = { buttonFixedPos: h.buttonFixedPos, seatCount };
  const roleActions = h.actions.map((a) => ({
    sequenceNumber: a.sequenceNumber,
    seatIndex: a.seatIndex,
    street: a.street,
    kind: a.kind,
    toAmount: a.toAmount,
    potBefore: a.potBefore,
  }));
  const betRoles = new Map(readBetRoles(roleActions, table).map((r) => [r.sequenceNumber, r.role as string]));
  const spots = new Map(readDecisionSpots(roleActions, table).map((s) => [s.sequenceNumber, s.kind as string]));
  for (const b of readBarrelCheckSpots(roleActions)) spots.set(b.sequenceNumber, "barrel");

  // ── トーナメントの状況(ハンド開始時点・プレイヤーごと) ──
  const itmPlaces = h.payouts.length > 0 ? h.payouts.length : null;
  const bubbleDistance = h.playersRemaining !== null && itmPlaces !== null ? h.playersRemaining - itmPlaces : null;
  const icm = h.fieldStacks.length > 0 ? computeIcm(h.fieldStacks, h.payouts) : [];
  const fieldTotal = h.fieldStacks.reduce((a, b) => a + b, 0);
  const usedField = new Set<number>();
  const tourney = new Map<string, { win: number | null; itm: number | null; equity: number | null; rank: number | null; share: number | null }>();
  const sortedField = [...h.fieldStacks].sort((a, b) => b - a);
  for (const s of h.seats) {
    const idx = h.fieldStacks.findIndex((x, i) => x === s.startingStack && !usedField.has(i));
    if (idx >= 0) {
      usedField.add(idx);
      const r = icm[idx]!;
      tourney.set(s.userId, {
        win: r.win,
        itm: itmPlaces !== null ? r.itm : null,
        equity: itmPlaces !== null ? r.equity : null,
        rank: sortedField.indexOf(s.startingStack) + 1,
        share: fieldTotal > 0 ? s.startingStack / fieldTotal : null,
      });
    } else {
      tourney.set(s.userId, { win: null, itm: null, equity: null, rank: null, share: null });
    }
  }

  // ── 直前の流れ(プレイヤーごと) ──
  const momentum = new Map<
    string,
    { prevDeltaBb: number | null; prevBigPot: string; handsSince: number | null; lastKind: string; lossStreak: number; index: number }
  >();
  for (const s of h.seats) {
    const hist = h.history.get(s.userId) ?? [];
    const prev = hist[0];
    let handsSince: number | null = null;
    let lastKind = "none";
    for (let i = 0; i < hist.length; i++) {
      const k = bigPotKindOf(hist[i]!);
      if (k) {
        handsSince = i + 1;
        lastKind = k;
        break;
      }
    }
    let lossStreak = 0;
    for (const x of hist) {
      if (x.resultStackDelta < 0) lossStreak += 1;
      else break;
    }
    const prevKind = prev ? bigPotKindOf(prev) : null;
    momentum.set(s.userId, {
      prevDeltaBb: prev ? round(prev.resultStackDelta / (prev.bigBlind || 1), 2) : null,
      prevBigPot: !prev ? "first" : prevKind === "win" ? "bigWin" : prevKind === "loss" ? "bigLoss" : "none",
      handsSince,
      lastKind,
      lossStreak,
      index: hist.length + 1,
    });
  }

  // ── ハンドの結果(プレイヤーごと) ──
  const foldedEver = new Set(h.actions.filter((a) => a.kind === "fold").map((a) => a.seatIndex));
  const winners = new Set(h.potWinners.flat());
  const preflopVoluntary = new Set<number>();
  const preflopRaise = new Set<number>();
  {
    let maxTo = 0;
    for (const a of h.actions) {
      if (a.street !== "preflop") continue;
      if (a.kind === "postBlind") {
        maxTo = Math.max(maxTo, a.toAmount ?? 0);
        continue;
      }
      if (a.kind === "call" || a.kind === "bet" || a.kind === "raise" || a.kind === "allIn") preflopVoluntary.add(a.seatIndex);
      if (a.kind === "raise" || a.kind === "bet" || (a.kind === "allIn" && (a.toAmount ?? 0) > maxTo)) preflopRaise.add(a.seatIndex);
      if (a.toAmount !== null && a.kind !== "postAnte") maxTo = Math.max(maxTo, a.toAmount);
    }
  }

  const minutesInto =
    h.startedAt && h.tournamentCreatedAt ? round((h.startedAt.getTime() - h.tournamentCreatedAt.getTime()) / 60000, 2) : null;

  // ── アクションを頭から再生して、各決定の時点の状況を読む ──
  const seatBy = new Map(h.seats.map((s) => [s.seatIndex, s]));
  const committed = new Map<number, number>(); // ハンド全体の拠出
  const streetContrib = new Map<number, number>(); // 今のストリートの累計(「〜まで」)
  const folded = new Set<number>();
  let street = "preflop";
  let maxStreet = 0;
  const seen = new Set<number>();
  const rows: DecisionFactRow[] = [];

  for (const a of [...h.actions].sort((x, y) => x.sequenceNumber - y.sequenceNumber)) {
    if (a.street !== street) {
      street = a.street;
      streetContrib.clear();
      maxStreet = 0;
    }
    const seat = seatBy.get(a.seatIndex);
    const prior = streetContrib.get(a.seatIndex) ?? 0;
    const stackBefore = (seat?.startingStack ?? 0) - (committed.get(a.seatIndex) ?? 0);

    if (a.kind === "postAnte") {
      const amt = a.toAmount ?? 0;
      committed.set(a.seatIndex, (committed.get(a.seatIndex) ?? 0) + amt);
      continue;
    }

    // 自動プレイヤーの決定はポットや直面額の追跡だけ行い、行は作らない(下で committed 等を更新する)。
    if (DECISION_KINDS.has(a.kind) && seat && !seat.isBot) {
      const facing = Math.max(0, maxStreet - prior);
      const aggressive = AGGRESSIVE.has(a.kind);
      const allIn = a.kind === "allIn";
      const betAmount = aggressive && a.toAmount !== null ? a.toAmount - prior : null;
      const betSizePot = betAmount !== null && a.potBefore > 0 ? round(betAmount / a.potBefore) : null;
      const others = h.seats.filter((s) => s.seatIndex !== a.seatIndex && !folded.has(s.seatIndex));
      const otherMax = Math.max(0, ...others.map((s) => s.startingStack - (committed.get(s.seatIndex) ?? 0)));
      const eff = Math.min(stackBefore, otherMax);
      const boardNow = h.board.slice(0, BOARD_LEN[a.street] ?? 0);
      const strength = a.street !== "preflop" ? readHandStrength(seat.holeCards, boardNow) : null;
      const tex = a.street !== "preflop" ? readBoardTexture(boardNow) : null;
      const t = tourney.get(seat.userId)!;
      const m = momentum.get(seat.userId)!;
      const spot = a.street === "preflop" ? "preflop" : (betRoles.get(a.sequenceNumber) ?? spots.get(a.sequenceNumber) ?? "other");
      const firstInHand = !seen.has(a.seatIndex);
      seen.add(a.seatIndex);
      const thinkMs = a.thinkMs;

      rows.push({
        handId: h.id,
        tournamentId: h.tournamentId,
        userId: seat.userId,
        gameType: h.gameType,
        handNumber: h.handNumber,
        sequenceNumber: a.sequenceNumber,
        street: a.street,
        kind: a.kind,
        actionClass: a.kind === "fold" ? "fold" : aggressive ? "aggressive" : "passive",
        firstInHand,
        handVpip: preflopVoluntary.has(a.seatIndex),
        handPfr: preflopRaise.has(a.seatIndex),
        thinkMs,
        thinkBucket: thinkBucketOf(thinkMs, a.timedOut, a.timeBankUsed),
        timedOut: a.timedOut,
        timeBankUsed: a.timeBankUsed,
        position: positions.get(a.seatIndex) ?? "",
        playersInHand: h.seats.length,
        playersActive: h.seats.length - folded.size,
        bigBlind: bb,
        potBb: round(a.potBefore / bb, 2),
        facingBb: facing > 0 ? round(facing / bb, 2) : null,
        betSizePot,
        betSizeBucket: betSizeBucketOf(betSizePot, allIn),
        stackBb: round(stackBefore / bb, 2),
        effStackBb: round(eff / bb, 2),
        stackBucket: stackBucketOfBb(eff / bb),
        spr: a.street !== "preflop" && a.potBefore > 0 ? round(eff / a.potBefore, 2) : null,
        handClass: handClassLabel(seat.holeCards),
        madeHand: strength?.made ?? null,
        hasDraw: strength?.hasAnyDraw ?? false,
        boardTexture: tex ? `${tex.suit}-${tex.draws}` : null,
        spot,
        playersRemaining: h.playersRemaining,
        itmPlaces,
        bubbleDistance,
        bubbleStage: bubbleStageOf(bubbleDistance),
        stackRank: t.rank,
        chipShare: t.share === null ? null : round(t.share, 4),
        winProb: t.win === null ? null : round(t.win, 4),
        itmProb: t.itm === null ? null : round(t.itm, 4),
        icmEquity: t.equity === null ? null : round(t.equity, 1),
        winProbBucket: winProbBucketOf(t.win),
        itmProbBucket: itmProbBucketOf(t.itm),
        prevHandDeltaBb: m.prevDeltaBb,
        prevBigPot: m.prevBigPot,
        handsSinceBigPot: m.handsSince,
        lastBigPotKind: m.lastKind,
        lossStreak: m.lossStreak,
        handIndexInTournament: m.index,
        minutesIntoTournament: minutesInto,
        stackVsStart:
          h.tournamentStartingStack && h.tournamentStartingStack > 0
            ? round(seat.startingStack / h.tournamentStartingStack, 3)
            : null,
        handResultBb: round(seat.resultStackDelta / bb, 2),
        wentToShowdown: !h.wonByFold && !foldedEver.has(a.seatIndex),
        wonHand: winners.has(seat.userId),
      });
    }

    // 状態の更新
    if (a.kind === "fold") folded.add(a.seatIndex);
    if (a.toAmount !== null && (a.kind === "postBlind" || a.kind === "call" || AGGRESSIVE.has(a.kind))) {
      const add = Math.max(0, a.toAmount - prior);
      committed.set(a.seatIndex, (committed.get(a.seatIndex) ?? 0) + add);
      streetContrib.set(a.seatIndex, a.toAmount);
      maxStreet = Math.max(maxStreet, a.toAmount);
    }
  }
  return rows;
}

// ───────────────────────────── DB ─────────────────────────────

/** 1ハンドぶんの研究用の行を作り直す(冪等)。ハンド記録の直後とバックフィルから使う。 */
export async function rebuildDecisionFactsForHand(handId: string): Promise<number> {
  const hand = await prisma.hand.findUnique({
    where: { id: handId },
    select: {
      id: true,
      tournamentId: true,
      handNumber: true,
      buttonFixedPos: true,
      levelBigBlind: true,
      board: true,
      wonByFold: true,
      startedAt: true,
      createdAt: true,
      playersRemaining: true,
      payouts: true,
      fieldStacks: true,
      tournament: { select: { gameType: true, createdAt: true, startingStack: true, payouts: true } },
      seats: {
        select: {
          seatIndex: true,
          userId: true,
          startingStack: true,
          holeCards: true,
          isSmallBlind: true,
          isBigBlind: true,
          resultStackDelta: true,
          user: { select: { isBot: true } },
        },
      },
      actions: {
        orderBy: { sequenceNumber: "asc" },
        select: {
          sequenceNumber: true,
          seatIndex: true,
          street: true,
          kind: true,
          toAmount: true,
          potBefore: true,
          thinkMs: true,
          timedOut: true,
          timeBankUsed: true,
        },
      },
      pots: { select: { winnerUserIds: true } },
    },
  });
  if (!hand) return 0;

  // 直前の流れは人間の行にしか使わないので、人間の分だけ読む。
  const userIds = hand.seats.filter((s) => !s.user.isBot).map((s) => s.userId);
  const historyRows = await prisma.handSeat.findMany({
    where: {
      userId: { in: userIds },
      hand: { tournamentId: hand.tournamentId, handNumber: { lt: hand.handNumber } },
    },
    orderBy: { hand: { handNumber: "desc" } },
    take: HISTORY_HANDS * Math.max(1, userIds.length),
    select: {
      userId: true,
      startingStack: true,
      resultStackDelta: true,
      hand: { select: { handNumber: true, levelBigBlind: true } },
    },
  });
  const history = new Map<string, FactHistoryHand[]>();
  for (const r of historyRows) {
    const list = history.get(r.userId) ?? [];
    if (list.length >= HISTORY_HANDS) continue;
    list.push({
      handNumber: r.hand.handNumber,
      startingStack: r.startingStack,
      resultStackDelta: r.resultStackDelta,
      bigBlind: r.hand.levelBigBlind,
    });
    history.set(r.userId, list);
  }

  const rows = buildDecisionFacts({
    id: hand.id,
    tournamentId: hand.tournamentId,
    gameType: hand.tournament.gameType,
    handNumber: hand.handNumber,
    buttonFixedPos: hand.buttonFixedPos,
    bigBlind: hand.levelBigBlind,
    board: hand.board,
    wonByFold: hand.wonByFold,
    startedAt: hand.startedAt ?? hand.createdAt,
    tournamentCreatedAt: hand.tournament.createdAt,
    tournamentStartingStack: hand.tournament.startingStack,
    playersRemaining: hand.playersRemaining,
    // 賞金はトーナメント単位で1回だけ持つ(SNG)。MTT のように途中で変わるものだけハンドに残っている。
    payouts: hand.payouts.length > 0 ? hand.payouts : hand.tournament.payouts,
    fieldStacks: hand.fieldStacks,
    seats: hand.seats.map((s) => ({
      seatIndex: s.seatIndex,
      userId: s.userId,
      isBot: s.user.isBot,
      startingStack: s.startingStack,
      holeCards: s.holeCards,
      isSmallBlind: s.isSmallBlind,
      isBigBlind: s.isBigBlind,
      resultStackDelta: s.resultStackDelta,
    })),
    actions: hand.actions,
    potWinners: hand.pots.map((p) => p.winnerUserIds),
    history,
  });

  await prisma.$transaction([
    prisma.decisionFact.deleteMany({ where: { handId } }),
    prisma.decisionFact.createMany({ data: rows }),
  ]);
  return rows.length;
}

export interface DecisionFactBackfillProgress {
  total: number;
  processed: number;
  rows: number;
}

/** 既存の全ハンドの研究用の行を作り直す(冪等。ID カーソルで200件ずつ)。 */
export async function backfillDecisionFacts(options?: {
  onProgress?: (p: DecisionFactBackfillProgress) => void;
}): Promise<DecisionFactBackfillProgress> {
  const total = await prisma.hand.count();
  let processed = 0;
  let rows = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.hand.findMany({
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });
    if (batch.length === 0) break;
    for (const h of batch) {
      try {
        rows += await rebuildDecisionFactsForHand(h.id);
      } catch (err) {
        console.error("[decisionFacts] backfill failed for hand", h.id, err);
      }
      processed += 1;
    }
    cursor = batch[batch.length - 1]!.id;
    options?.onProgress?.({ total, processed, rows });
  }
  return { total, processed, rows };
}
