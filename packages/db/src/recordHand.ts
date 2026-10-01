import type { HandEngine } from "@meta-geo/engine";
import { cardToString } from "@meta-geo/engine";
import { prisma } from "./client.js";
import { rebuildDecisionFactsForHand } from "./decisionFacts.js";
import { rebuildGeoDecisionsForHand } from "./geoTree.js";

export interface RecordHandSeatInput {
  readonly seatIndex: number;
  readonly userId: string;
  readonly startingStack: number;
  readonly isSmallBlind: boolean;
  readonly isBigBlind: boolean;
  /** そのハンド中、このプレイヤーが離席状態だったか。GEO集計から除外するために記録する。 */
  readonly wasAway?: boolean;
}

/** 1アクションの時刻(研究用)。キーは HandAction の sequenceNumber。 */
export interface ActionTiming {
  readonly turnStartedAt: Date;
  readonly actedAt: Date;
  /** 思考時間(ms)。自動で卓を埋めるプレイヤーの行は null(作り物の遅延なので研究に使わない)。 */
  readonly thinkMs: number | null;
  /** 時間切れ(または離脱)による自動のチェック/フォールドか。 */
  readonly timedOut: boolean;
  /** タイムバンクで延長して考えたか。 */
  readonly timeBankUsed: boolean;
}

/** 研究用に、ハンドの外(サーバーのメモリ)にしか無い情報。無ければ null のまま記録する。 */
export interface RecordHandResearchInput {
  readonly startedAt?: Date | undefined;
  readonly endedAt?: Date | undefined;
  /** ハンド開始時点のトーナメント全体の生存人数(MTT は全卓)。 */
  readonly playersRemaining?: number | undefined;
  readonly entryCount?: number | undefined;
  /** 1位から順の賞金(長さ = 入賞人数)。 */
  readonly payouts?: readonly number[] | undefined;
  /** ハンド開始時点の全生存者のスタック(ICM 用)。 */
  readonly fieldStacks?: readonly number[] | undefined;
  readonly timings?: ReadonlyMap<number, ActionTiming> | undefined;
}

export interface RecordHandInput {
  readonly tournamentId: string;
  readonly handNumber: number;
  readonly buttonFixedPos: number;
  readonly levelSmallBlind: number;
  readonly levelBigBlind: number;
  readonly levelAnte: number;
  readonly seats: readonly RecordHandSeatInput[];
  readonly hand: HandEngine;
  /** 研究用の付帯情報(データベースタブの「データ研究」)。 */
  readonly research?: RecordHandResearchInput;
}

/**
 * 完了したハンドをDBへ記録する。GEO分析の核となるテーブル群(Hand/HandSeat/HandAction/HandPot)へ
 * 1トランザクションで書き込む。Ten-Four Pokerの「全履歴公開」思想を踏襲し、ショーダウンの有無に
 * 関わらず全プレイヤーのホールカードを常に記録する。
 */
export async function recordHand(input: RecordHandInput): Promise<string> {
  const result = input.hand.getResult();
  const events = input.hand.getEvents();
  const allHoleCards = input.hand.getAllHoleCards();
  const finalStacks = input.hand.getStacks();

  const potTotal = result.pots.reduce((sum, p) => sum + p.amount, 0);
  const research = input.research ?? {};

  const handId = await prisma.$transaction(async (tx) => {
    const hand = await tx.hand.create({
      data: {
        tournamentId: input.tournamentId,
        handNumber: input.handNumber,
        levelSmallBlind: input.levelSmallBlind,
        levelBigBlind: input.levelBigBlind,
        levelAnte: input.levelAnte,
        buttonFixedPos: input.buttonFixedPos,
        board: result.board.map(cardToString),
        potTotal,
        wonByFold: result.wonByFold,
        startedAt: research.startedAt ?? null,
        endedAt: research.endedAt ?? null,
        playersRemaining: research.playersRemaining ?? null,
        entryCount: research.entryCount ?? null,
        itmPlaces: research.payouts ? research.payouts.length : null,
        payouts: research.payouts ? [...research.payouts] : [],
        fieldStacks: research.fieldStacks ? [...research.fieldStacks] : [],
      },
    });

    await tx.handSeat.createMany({
      data: input.seats.map((s) => ({
        handId: hand.id,
        userId: s.userId,
        seatIndex: s.seatIndex,
        startingStack: s.startingStack,
        holeCards: (allHoleCards.get(s.seatIndex) ?? []).map(cardToString),
        isSmallBlind: s.isSmallBlind,
        isBigBlind: s.isBigBlind,
        resultStackDelta: (finalStacks.get(s.seatIndex) ?? s.startingStack) - s.startingStack,
        wasAway: s.wasAway ?? false,
      })),
    });

    const actionEvents = events.filter(
      (e): e is typeof e & { seatIndex: number; street: string } =>
        typeof e["seatIndex"] === "number" && typeof e["street"] === "string",
    );
    await tx.handAction.createMany({
      data: actionEvents.map((e) => {
        const seq = e["sequenceNumber"] as number;
        const t = research.timings?.get(seq);
        return {
          handId: hand.id,
          sequenceNumber: seq,
          seatIndex: e["seatIndex"] as number,
          street: e["street"] as string,
          kind: e["type"] as string,
          toAmount: typeof e["toAmount"] === "number" ? (e["toAmount"] as number) : (e["amount"] as number | undefined) ?? null,
          potBefore: (e["potBefore"] as number | undefined) ?? 0,
          turnStartedAt: t?.turnStartedAt ?? null,
          actedAt: t?.actedAt ?? null,
          thinkMs: t?.thinkMs ?? null,
          timedOut: t?.timedOut ?? false,
          timeBankUsed: t?.timeBankUsed ?? false,
        };
      }),
    });

    await tx.handPot.createMany({
      data: result.pots.map((pot, potIndex) => {
        const winnerUserIds = pot.eligiblePlayerIds.filter((playerId) => (result.payouts.get(playerId) ?? 0) > 0);
        return {
          handId: hand.id,
          potIndex,
          amount: pot.amount,
          eligibleUserIds: [...pot.eligiblePlayerIds],
          winnerUserIds,
        };
      }),
    });

    return hand.id;
  });

  // GEO集計用の事前展開(GeoDecision)。ここで書いておくことで、GEOのノードを開くたびに
  // 全履歴をリプレイしなくて済む。失敗してもハンドの記録自体は成立させたいので握りつぶし、
  // ログにだけ残す(取りこぼしはバックフィルで埋め直せる)。
  try {
    await rebuildGeoDecisionsForHand(handId);
  } catch (err) {
    console.error("[recordHand] failed to build GeoDecision rows:", err);
  }
  // 研究用の1アクション1行(DecisionFact)。同じく失敗してもハンドの記録は成立させる。
  try {
    await rebuildDecisionFactsForHand(handId);
  } catch (err) {
    console.error("[recordHand] failed to build DecisionFact rows:", err);
  }

  return handId;
}
