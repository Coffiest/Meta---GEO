import { Prisma } from "@prisma/client";
import { prisma } from "./client.js";
import { extractHeroDecisions, type ExtractHand, type HeroDecision } from "./reviewExtract.js";
import { handClassLabel } from "./preflopBaseline.js";
import { openGtoActions, defenseGtoActions, vsJamGtoActions, allInCallGtoActions } from "./reviewGto.js";
import {
  classifyDecision,
  gtoAccuracyPct,
  isMistake,
  type Classification,
  type DifficultActionKind,
  type GtoActionEV,
} from "./reviewClassify.js";

/**
 * 局後検討のオーケストレーション。1ハンド×1hero(自分)の意思決定を抽出→GTO基準で分類→永続化する。
 *
 * GTO基準(v2, reviewGto.ts):
 *  - プリフロップ オープン(RFI): 転記レンジ(バンド別)+EVモデル
 *  - プリフロップ vsジャム: 自社Nash+equity行列(厳密EV)
 *  - プリフロップ vsオープンレイズ: 計算済みディフェンス+EVモデル
 *  - HUポストフロップの対オールイン: computeAllInEquity(実ハンド同士の厳密equity)
 *  - HUポストフロップの通常ノード: 未対応(CFRソルバー非同期連携は後続) → gtoActions=null(解析待ち表示)
 *  - リンプポット/3betライン/スクイーズ: outOfScopeReason 付きで対象外
 */

const HAND_INCLUDE = {
  seats: { select: { seatIndex: true, userId: true, startingStack: true, holeCards: true } },
  actions: {
    orderBy: { sequenceNumber: "asc" as const },
    select: { sequenceNumber: true, seatIndex: true, street: true, kind: true, toAmount: true, potBefore: true },
  },
};

const SEAT_COUNT = 6;
const POSITION_NAMES = ["BTN", "SB", "BB", "UTG", "HJ", "CO"] as const;
function positionOfSeat(seatIndex: number, buttonFixedPos: number): string {
  const offset = (((seatIndex - buttonFixedPos) % SEAT_COUNT) + SEAT_COUNT) % SEAT_COUNT;
  return POSITION_NAMES[offset] ?? "";
}

/** heroのプリフロップ意思決定の直前文脈(スポット種別)。 */
type PreflopSpot =
  | { kind: "open" }
  | { kind: "vsJam"; jammerPos: string }
  | { kind: "vsOpen"; openerPos: string }
  | { kind: "unsupported"; reason: string };

/**
 * heroのプリフロップ決定の直前までのアクションから、スポット種別を判定する。
 *  - 先行アクションなし(全員フォールド) → open
 *  - 先行がちょうど1レイズでオールイン → vsJam / 非オールイン → vsOpen
 *  - リンプ/コールが入った・2レイズ以上・hero自身が既に行動済み → unsupported(理由付き)
 */
function detectPreflopSpot(hand: ExtractHand, heroSeat: number, decisionSeq: number): PreflopSpot {
  const raises: { seatIndex: number; kind: string }[] = [];
  let limpersOrCallers = 0;
  let heroActed = false;
  for (const a of hand.actions) {
    if (a.sequenceNumber >= decisionSeq) break;
    if (a.street !== "preflop") continue;
    if (a.kind === "postBlind" || a.kind === "postAnte") continue;
    if (a.seatIndex === heroSeat) {
      if (a.kind !== "fold") heroActed = true;
      continue;
    }
    if (a.kind === "bet" || a.kind === "raise" || a.kind === "allIn") raises.push({ seatIndex: a.seatIndex, kind: a.kind });
    else if (a.kind === "call") limpersOrCallers += 1;
  }
  if (heroActed) return { kind: "unsupported", reason: "reopened-line" }; // 自分のオープンに3bet等が返ってきた2巡目
  if (raises.length === 0) {
    if (limpersOrCallers > 0) return { kind: "unsupported", reason: "limped-pot" };
    return { kind: "open" };
  }
  if (raises.length === 1) {
    if (limpersOrCallers > 0) return { kind: "unsupported", reason: "squeeze" };
    const pos = positionOfSeat(raises[0]!.seatIndex, hand.buttonFixedPos);
    return raises[0]!.kind === "allIn" ? { kind: "vsJam", jammerPos: pos } : { kind: "vsOpen", openerPos: pos };
  }
  return { kind: "unsupported", reason: "3bet-line" };
}

/** ポストフロップHUで、相手が既にオールインしているか(=hero はコール/フォールドのみ)。 */
function villainAllInBefore(hand: ExtractHand, heroSeat: number, decisionSeq: number, street: string): number | null {
  let allInSeat: number | null = null;
  for (const a of hand.actions) {
    if (a.sequenceNumber >= decisionSeq) break;
    if (a.street !== street) continue;
    if (a.seatIndex === heroSeat) continue;
    if (a.kind === "allIn") allInSeat = a.seatIndex;
  }
  return allInSeat;
}

/** 呼称ラベル(チャットボット未実装時の「正解表示」用)。 */
function actionNameOf(decision: HeroDecision, spot: PreflopSpot | null): string {
  const k = decision.actionTaken.kind;
  if (decision.street === "preflop") {
    if (k === "fold") return "フォールド";
    if (spot?.kind === "open") return k === "allIn" ? "オープンジャム" : k === "call" ? "リンプ" : "オープンレイズ";
    if (spot?.kind === "vsJam") return k === "call" || k === "allIn" ? "オールインコール" : "コール";
    if (spot?.kind === "vsOpen") {
      if (k === "call") return "コール";
      if (k === "allIn") return "3ベットジャム";
      if (k === "raise") return "リレイズ(3ベット)";
    }
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

/**
 * heroの実アクションを、GTO基準の選択肢バケットへスナップする。
 * レイズサイズの丸め差(例: 2.7bbオープン vs 基準2.1bb)で「ツリー外の手」と誤判定しないための対応。
 */
function snapChosenBucket(actionTaken: HeroDecision["actionTaken"], gtoActions: GtoActionEV[], spot: PreflopSpot | null): string {
  const k = actionTaken.kind;
  const buckets = gtoActions.map((a) => a.bucket);
  if (spot?.kind === "vsJam") {
    // ジャムに対する再オールインは実質コール。
    return k === "fold" ? "fold" : "call";
  }
  if (k === "fold") return "fold";
  if (buckets.includes(actionTaken.bucket)) return actionTaken.bucket;
  if (k === "allIn" && buckets.includes("allIn")) return "allIn";
  if ((k === "call" || k === "check") && buckets.includes("call")) return "call";
  if ((k === "call" || k === "check") && buckets.includes("checkOrCall")) return "checkOrCall";
  // レイズ系: 基準側のレイズバケットが1つだけなら、サイズ差を許容してそこへスナップ。
  if (k === "raise" || k === "bet") {
    const raiseBuckets = buckets.filter((b) => b.startsWith("raise") || b.startsWith("bet"));
    if (raiseBuckets.length === 1) return raiseBuckets[0]!;
  }
  return actionTaken.bucket;
}

/** 抽出済みheroデシジョンをGTO基準で分類する(v2: open/vsJam/vsOpen/対オールイン)。 */
function analyzeDecisions(hand: ExtractHand, heroSeat: number, decisions: HeroDecision[]): ReviewedDecision[] {
  return decisions.map((d) => {
    let gtoActions: GtoActionEV[] | null = null;
    let classification: Classification | null = null;
    let evLossBb: number | null = null;
    let outOfScopeReason: string | null = d.outOfScopeReason ?? null;
    let spot: PreflopSpot | null = null;
    let difficultKind: DifficultActionKind | undefined;

    const handClass = handClassLabel(d.holeCards);

    if (d.analyzable && handClass) {
      if (d.street === "preflop") {
        spot = detectPreflopSpot(hand, heroSeat, d.sequenceNumber);
        if (spot.kind === "open") {
          gtoActions = openGtoActions({ heroPos: d.heroPos, handClass, effStackBb: d.effStackBb });
        } else if (spot.kind === "vsJam") {
          const riskBb = Math.min(d.effStackBb, Math.max(1, d.facingSizeBb));
          gtoActions = vsJamGtoActions({ jammerPos: spot.jammerPos, heroPos: d.heroPos, riskBb, handClass });
          // ヒーローコール(難しい好手)候補: ジャムに対してコールを選んだ場合のみ渡す
          // (分類器側で「EV損≈0 かつ GTO頻度≤15%」を満たしたときだけ芸術的になる)。
          if (gtoActions && d.actionTaken.kind !== "fold") difficultKind = "heroCall";
        } else if (spot.kind === "vsOpen") {
          gtoActions = defenseGtoActions({
            openerPos: spot.openerPos,
            heroPos: d.heroPos,
            handClass,
            effStackBb: d.effStackBb,
          });
        } else {
          outOfScopeReason = spot.reason;
        }
      } else if (d.liveCount === 2) {
        // HUポストフロップ: 相手が既にオールイン → 実ハンド同士の厳密equityでコール/フォールドを分類。
        const allInSeat = villainAllInBefore(hand, heroSeat, d.sequenceNumber, d.street);
        if (allInSeat !== null && d.facingSizeBb > 0) {
          const villain = hand.seats.find((s) => s.seatIndex === allInSeat);
          if (villain && villain.holeCards.length === 2) {
            const callBb = Math.min(Math.max(0.01, d.facingSizeBb), Math.max(0.01, d.effStackBb));
            gtoActions = allInCallGtoActions({
              heroCards: d.holeCards,
              villainCards: villain.holeCards,
              boardSoFar: d.boardSoFar,
              potBb: d.potBb,
              callBb,
            });
            if (gtoActions && d.actionTaken.kind !== "fold") difficultKind = "heroCall";
          }
        }
        // 通常のHUノード(ベット/チェック等)はCFRソルバー連携(後続)まで gtoActions=null(解析待ち)。
      }
    }

    if (gtoActions && gtoActions.length > 0) {
      const chosenBucket = snapChosenBucket(d.actionTaken, gtoActions, spot);
      const result = classifyDecision({
        gtoActions,
        chosenBucket,
        isPreflop: d.street === "preflop",
        difficultKind,
      });
      if (result) {
        classification = result.classification;
        evLossBb = result.evLossBb;
      }
    }

    return {
      sequenceNumber: d.sequenceNumber,
      street: d.street,
      analyzable: d.analyzable,
      outOfScopeReason,
      heroPos: d.heroPos,
      effStackBb: d.effStackBb,
      potBb: d.potBb,
      facingSizeBb: d.facingSizeBb,
      actionTaken: d.actionTaken,
      gtoActions,
      evLossBb,
      classification,
      actionName: actionNameOf(d, spot),
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

/**
 * DB非依存の解析エントリ(ユニットテスト用にも公開)。
 * 生のハンドオブジェクトから抽出→分類→集計まで行う。
 */
export function analyzeExtractedHand(
  hand: ExtractHand,
  heroUserId: string,
): { decisions: ReviewedDecision[]; summary: ReturnType<typeof summarize> } | null {
  const heroSeatEntry = hand.seats.find((s) => s.userId === heroUserId);
  if (!heroSeatEntry) return null;
  const heroDecisions = extractHeroDecisions(hand, heroUserId);
  const decisions = analyzeDecisions(hand, heroSeatEntry.seatIndex, heroDecisions);
  return { decisions, summary: summarize(decisions) };
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

  const analyzed = analyzeExtractedHand(extractHand, heroUserId);
  if (!analyzed) return null;
  void heroSeatEntry;
  return { handId, heroUserId, decisions: analyzed.decisions, ...analyzed.summary };
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
