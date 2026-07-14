import { Prisma } from "@prisma/client";
import { prisma } from "./client.js";
import { extractHeroDecisions, type ExtractHand, type HeroDecision } from "./reviewExtract.js";
import { getPreflopBaseline, handClassLabel, OPEN_BUCKET } from "./preflopBaseline.js";
import {
  classifyDecision,
  gtoAccuracyPct,
  isMistake,
  type Classification,
  type GtoActionEV,
} from "./reviewClassify.js";

/**
 * 局後検討のオーケストレーション。1ハンド×1hero(自分)の意思決定を抽出→GTO基準で分類→永続化する。
 *
 * v1のGTO基準はプリフロップRFI(全員フォールドで回ってきた最初の開き)のみ。フェイスやポストフロップHUは
 * ソルバー未実装のため gtoActions=null(分類保留)として保存する。UIは「解析待ち/未対応」と表示する。
 */

const HAND_INCLUDE = {
  seats: { select: { seatIndex: true, userId: true, startingStack: true, holeCards: true } },
  actions: {
    orderBy: { sequenceNumber: "asc" as const },
    select: { sequenceNumber: true, seatIndex: true, street: true, kind: true, toAmount: true, potBefore: true },
  },
};

/** heroのプリフロップ意思決定が「RFI(自分より前に誰もオープンしていない)」かどうかを判定。 */
function isRfiSpot(hand: ExtractHand, heroSeat: number, decisionSeq: number): boolean {
  for (const a of hand.actions) {
    if (a.sequenceNumber >= decisionSeq) break;
    if (a.street !== "preflop") continue;
    if (a.seatIndex === heroSeat) continue;
    if (a.kind === "bet" || a.kind === "raise" || a.kind === "allIn" || a.kind === "call") return false;
  }
  return true;
}

/** 呼称ラベル(チャットボット未実装時の「正解表示」用)。 */
function actionNameOf(decision: HeroDecision, isRfi: boolean): string {
  const k = decision.actionTaken.kind;
  if (decision.street === "preflop") {
    if (k === "fold") return "フォールド";
    if (isRfi) return "オープンレイズ";
    if (k === "call") return "コール";
    if (k === "raise" || k === "allIn") return "リレイズ(3ベット)";
    return k;
  }
  if (k === "fold") return "フォールド";
  if (k === "check") return "チェック";
  if (k === "call") return "コール";
  if (k === "bet") return "ベット";
  if (k === "raise") return "レイズ";
  if (k === "allIn") return "オールイン";
  return k;
}

export interface ReviewedDecision {
  sequenceNumber: number;
  street: string;
  analyzable: boolean;
  outOfScopeReason: string | null;
  heroPos: string;
  effStackBb: number;
  potBb: number;
  facingSizeBb: number | null;
  actionTaken: { kind: string; bucket: string; toAmount: number | null };
  gtoActions: GtoActionEV[] | null;
  evLossBb: number | null;
  classification: Classification | null;
  actionName: string;
}

export interface ReviewResult {
  handId: string;
  heroUserId: string;
  gtoAccuracy: number | null;
  totalEvLossBb: number | null;
  mistakeCount: number;
  artisticCount: number;
  decisions: ReviewedDecision[];
}

/** 抽出済みheroデシジョンをGTO基準で分類する(v1: プリフロップRFIのみ)。 */
function analyzeDecisions(hand: ExtractHand, heroSeat: number, decisions: HeroDecision[]): ReviewedDecision[] {
  return decisions.map((d) => {
    let gtoActions: GtoActionEV[] | null = null;
    let classification: Classification | null = null;
    let evLossBb: number | null = null;

    const isRfi = d.street === "preflop" && isRfiSpot(hand, heroSeat, d.sequenceNumber);

    if (d.analyzable && d.street === "preflop" && isRfi) {
      const handClass = handClassLabel(d.holeCards);
      const baseline = handClass ? getPreflopBaseline({ heroPos: d.heroPos, line: [], handClass }) : null;
      if (baseline) {
        gtoActions = baseline.map((b) => ({ bucket: b.bucket, frequency: b.frequency, evBb: b.evBb }));
        const chosenBucket = d.actionTaken.kind === "fold" ? "fold" : OPEN_BUCKET;
        const result = classifyDecision({ gtoActions, chosenBucket, isPreflop: true });
        if (result) {
          classification = result.classification;
          evLossBb = result.evLossBb;
        }
      }
    }

    return {
      sequenceNumber: d.sequenceNumber,
      street: d.street,
      analyzable: d.analyzable,
      outOfScopeReason: d.outOfScopeReason ?? null,
      heroPos: d.heroPos,
      effStackBb: d.effStackBb,
      potBb: d.potBb,
      facingSizeBb: d.facingSizeBb,
      actionTaken: d.actionTaken,
      gtoActions,
      evLossBb,
      classification,
      actionName: actionNameOf(d, isRfi),
    };
  });
}

function summarize(decisions: ReviewedDecision[]): {
  gtoAccuracy: number | null;
  totalEvLossBb: number | null;
  mistakeCount: number;
  artisticCount: number;
} {
  const classified = decisions.filter((d) => d.classification !== null && d.evLossBb !== null);
  if (classified.length === 0) return { gtoAccuracy: null, totalEvLossBb: null, mistakeCount: 0, artisticCount: 0 };
  const totalEvLossBb = classified.reduce((s, d) => s + (d.evLossBb ?? 0), 0);
  const avg = totalEvLossBb / classified.length;
  const mistakeCount = classified.filter((d) => d.classification && isMistake(d.classification)).length;
  const artisticCount = classified.filter((d) => d.classification === "artistic").length;
  return { gtoAccuracy: gtoAccuracyPct(avg), totalEvLossBb, mistakeCount, artisticCount };
}

/** DBから1ハンドを読み、heroの意思決定を解析して純粋な結果を返す(永続化はしない)。 */
export async function analyzeHand(handId: string, heroUserId: string): Promise<ReviewResult | null> {
  const hand = await prisma.hand.findUnique({
    where: { id: handId },
    select: { buttonFixedPos: true, levelBigBlind: true, board: true, ...HAND_INCLUDE },
  });
  if (!hand) return null;
  const heroSeatEntry = hand.seats.find((s) => s.userId === heroUserId);
  if (!heroSeatEntry) return null;

  const extractHand: ExtractHand = {
    buttonFixedPos: hand.buttonFixedPos,
    levelBigBlind: hand.levelBigBlind,
    board: hand.board,
    seats: hand.seats.map((s) => ({
      seatIndex: s.seatIndex,
      userId: s.userId,
      startingStack: s.startingStack,
      holeCards: s.holeCards,
    })),
    actions: hand.actions.map((a) => ({
      sequenceNumber: a.sequenceNumber,
      seatIndex: a.seatIndex,
      street: a.street,
      kind: a.kind,
      toAmount: a.toAmount,
      potBefore: a.potBefore,
    })),
  };

  const heroDecisions = extractHeroDecisions(extractHand, heroUserId);
  const decisions = analyzeDecisions(extractHand, heroSeatEntry.seatIndex, heroDecisions);
  const summary = summarize(decisions);

  return { handId, heroUserId, decisions, ...summary };
}

/** 解析結果を HandReview / ReviewDecision に永続化(upsert)する。 */
export async function saveReview(result: ReviewResult): Promise<string> {
  const review = await prisma.handReview.upsert({
    where: { handId_heroUserId: { handId: result.handId, heroUserId: result.heroUserId } },
    create: {
      handId: result.handId,
      heroUserId: result.heroUserId,
      status: "done",
      gtoAccuracy: result.gtoAccuracy,
      totalEvLossBb: result.totalEvLossBb,
      mistakeCount: result.mistakeCount,
      artisticCount: result.artisticCount,
    },
    update: {
      status: "done",
      error: null,
      gtoAccuracy: result.gtoAccuracy,
      totalEvLossBb: result.totalEvLossBb,
      mistakeCount: result.mistakeCount,
      artisticCount: result.artisticCount,
    },
  });

  await prisma.reviewDecision.deleteMany({ where: { reviewId: review.id } });
  await prisma.reviewDecision.createMany({
    data: result.decisions.map((d) => ({
      reviewId: review.id,
      sequenceNumber: d.sequenceNumber,
      street: d.street,
      analyzable: d.analyzable,
      outOfScopeReason: d.outOfScopeReason,
      heroPos: d.heroPos,
      effStackBb: d.effStackBb,
      potBb: d.potBb,
      facingSizeBb: d.facingSizeBb,
      actionTaken: d.actionTaken as unknown as Prisma.InputJsonValue,
      gtoActions: d.gtoActions === null ? Prisma.JsonNull : (d.gtoActions as unknown as Prisma.InputJsonValue),
      evLossBb: d.evLossBb,
      classification: d.classification,
      actionName: d.actionName,
    })),
  });

  return review.id;
}

/** ハンドを解析して保存し、結果を返す(APIのメインエントリ)。 */
export async function createOrRefreshReview(handId: string, heroUserId: string): Promise<ReviewResult | null> {
  const result = await analyzeHand(handId, heroUserId);
  if (!result) return null;
  await saveReview(result);
  return result;
}

export interface TournamentReviewHand extends ReviewResult {
  handNumber: number;
}

export interface TournamentReview {
  tournamentId: string;
  /** トナメ全体のGTO精度%(全ハンドの分類済み決定を平均)。 */
  gtoAccuracy: number | null;
  totalDecisions: number;
  classifiedDecisions: number;
  mistakeCount: number;
  artisticCount: number;
  hands: TournamentReviewHand[];
}

/** 1トーナメントの、heroが着席した全ハンドをまとめて解析する(チェスドットコム風の一括解析)。 */
export async function analyzeTournamentForHero(tournamentId: string, heroUserId: string): Promise<TournamentReview> {
  const hands = await prisma.hand.findMany({
    where: { tournamentId, seats: { some: { userId: heroUserId } } },
    orderBy: { handNumber: "asc" },
    select: { id: true, handNumber: true },
  });

  const reviewed: TournamentReviewHand[] = [];
  for (const h of hands) {
    const r = await analyzeHand(h.id, heroUserId);
    if (r) reviewed.push({ ...r, handNumber: h.handNumber });
  }

  const allClassified = reviewed.flatMap((h) => h.decisions).filter((d) => d.classification !== null && d.evLossBb !== null);
  const totalDecisions = reviewed.reduce((s, h) => s + h.decisions.length, 0);
  const avg =
    allClassified.length > 0 ? allClassified.reduce((s, d) => s + (d.evLossBb ?? 0), 0) / allClassified.length : null;

  return {
    tournamentId,
    gtoAccuracy: avg === null ? null : gtoAccuracyPct(avg),
    totalDecisions,
    classifiedDecisions: allClassified.length,
    mistakeCount: reviewed.reduce((s, h) => s + h.mistakeCount, 0),
    artisticCount: reviewed.reduce((s, h) => s + h.artisticCount, 0),
    hands: reviewed,
  };
}

/** レビュー画面の再生用に、1ハンドの全アクションタイムライン+席+ボード+ブラインドを返す。 */
export async function getHandTimeline(handId: string) {
  const hand = await prisma.hand.findUnique({
    where: { id: handId },
    select: {
      id: true,
      handNumber: true,
      tournamentId: true,
      buttonFixedPos: true,
      levelSmallBlind: true,
      levelBigBlind: true,
      levelAnte: true,
      board: true,
      potTotal: true,
      seats: {
        orderBy: { seatIndex: "asc" as const },
        select: {
          seatIndex: true,
          userId: true,
          startingStack: true,
          holeCards: true,
          isSmallBlind: true,
          isBigBlind: true,
          user: { select: { displayName: true } },
        },
      },
      actions: {
        orderBy: { sequenceNumber: "asc" as const },
        select: { sequenceNumber: true, seatIndex: true, street: true, kind: true, toAmount: true, potBefore: true },
      },
    },
  });
  return hand;
}
