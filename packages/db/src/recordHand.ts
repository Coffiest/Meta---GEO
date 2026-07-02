import type { HandEngine } from "@meta-geo/engine";
import { cardToString } from "@meta-geo/engine";
import { prisma } from "./client.js";

export interface RecordHandSeatInput {
  readonly seatIndex: number;
  readonly userId: string;
  readonly startingStack: number;
  readonly isSmallBlind: boolean;
  readonly isBigBlind: boolean;
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
      })),
    });

    const actionEvents = events.filter(
      (e): e is typeof e & { seatIndex: number; street: string } =>
        typeof e["seatIndex"] === "number" && typeof e["street"] === "string",
    );
    await tx.handAction.createMany({
      data: actionEvents.map((e) => ({
        handId: hand.id,
        sequenceNumber: e["sequenceNumber"] as number,
        seatIndex: e["seatIndex"] as number,
        street: e["street"] as string,
        kind: e["type"] as string,
        toAmount: typeof e["toAmount"] === "number" ? (e["toAmount"] as number) : (e["amount"] as number | undefined) ?? null,
        potBefore: (e["potBefore"] as number | undefined) ?? 0,
      })),
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

  return handId;
}
