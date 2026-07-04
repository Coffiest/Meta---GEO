import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  HandEngine,
  MultiTableTournament,
  cardToString,
  type Card,
  type PlayerAction,
} from "@meta-geo/engine";
import { prisma, recordHand, recordBuyIn, recordPayout, computePayoutStructure } from "@meta-geo/db";
import { decideBotAction } from "./bot.js";
import { ACTION_CLOCK_MS, ensureBotUsers, type GameSession } from "./gameServer.js";

const BOT_ACTION_DELAY_MS = 900;
const NEXT_HAND_DELAY_MS = 3000;
const FAST_DELAY_MS = 15;

interface PlayerInfo {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarKey: string | null;
  readonly isBot: boolean;
}

export interface MttSessionConfig {
  readonly io: Server;
  readonly buyIn: number;
  readonly tableSeatCount: number;
  readonly fieldSize: number;
  readonly humanUserId: string;
  readonly humanDisplayName: string;
  readonly humanAvatarKey: string | null;
}

/**
 * MTT(複数テーブル)セッション。MultiTableTournamentエンジンに複数卓の進行・テーブル
 * バランシング・共有ブラインドクロックを委譲し、このクラスはソケット入出力とBOT駆動を担う。
 *
 * 進行はロックステップ方式: 全体で同時に1ハンドだけをアクティブにし、卓をローテーションしながら
 * 1ハンドずつ消化する。人間が座っている卓のハンドは通常速度の対話進行、BOTのみの卓のハンドは
 * 同期的に瞬時消化する。これにより「ハンドとハンドの間でのみバランシングする」というエンジンの
 * 前提が常に守られる(卓をまたぐチップ整合性が壊れない)。
 */
export class MttSession implements GameSession {
  private mtt: MultiTableTournament | null = null;
  private hand: HandEngine | null = null;
  private activeTableId: number | null = null;
  private dbTournamentId: string | null = null;
  private readonly playersById = new Map<string, PlayerInfo>();
  private humanSocket: Socket | null = null;
  private finished = false;
  private humanDone = false;
  private humanLeft = false;
  private humanResultRecorded = false;
  private bustedOrder: string[] = [];
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private levelEndsAt = 0;
  private tableRotation = 0;
  private acceleratedHands = 0;

  private readonly io: Server;
  readonly buyIn: number;
  private readonly tableSeatCount: number;
  private readonly fieldSize: number;
  private readonly humanUserId: string;
  private readonly roomId = `mtt:${randomUUID()}`;

  constructor(config: MttSessionConfig) {
    this.io = config.io;
    this.buyIn = config.buyIn;
    this.tableSeatCount = config.tableSeatCount;
    this.fieldSize = config.fieldSize;
    this.humanUserId = config.humanUserId;
    this.playersById.set(config.humanUserId, {
      userId: config.humanUserId,
      displayName: config.humanDisplayName,
      avatarKey: config.humanAvatarKey,
      isBot: false,
    });
  }

  isFinished(): boolean {
    return this.finished;
  }

  isHumanDone(): boolean {
    return this.humanDone || this.finished;
  }

  async start(): Promise<void> {
    const botUsers = await ensureBotUsers(this.fieldSize - 1);
    for (const b of botUsers) {
      this.playersById.set(b.id, { userId: b.id, displayName: b.displayName, avatarKey: b.avatarKey, isBot: true });
    }

    this.mtt = new MultiTableTournament({
      tableSeatCount: this.tableSeatCount,
      players: [...this.playersById.values()].map((p) => ({ playerId: p.userId, displayName: p.displayName })),
    });

    const dbTournament = await prisma.tournament.create({
      data: {
        seatCount: this.tableSeatCount,
        startingStack: 20_000,
        status: "running",
        gameType: "mtt",
        buyIn: this.buyIn,
      },
    });
    this.dbTournamentId = dbTournament.id;
    await prisma.tournamentEntry.createMany({
      data: [...this.playersById.values()].map((p, i) => ({
        tournamentId: dbTournament.id,
        userId: p.userId,
        // MTTでは席は卓をまたいで変動するため、エントリーの席番号は登録順の通し番号にする
        seatIndex: i,
      })),
    });

    if (this.buyIn > 0) {
      await recordBuyIn({ userId: this.humanUserId, tournamentId: dbTournament.id, amount: this.buyIn });
    }

    this.scheduleLevelAdvance();
    this.pump();
  }

  attachHuman(socket: Socket): void {
    this.humanSocket = socket;
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    void socket.join(this.roomId);
    socket.on("action", (action: PlayerAction) => {
      const seatIndex = this.humanSeatOnActiveTable();
      if (seatIndex !== null) this.handleAction(seatIndex, action);
    });
    socket.on("disconnect", () => {
      if (this.humanSocket !== socket) return;
      this.humanSocket = null;
      // 再接続されないまま60秒経ったら離脱扱いにする
      this.disconnectTimer = setTimeout(() => {
        if (!this.humanSocket) this.leave();
      }, 60_000);
    });

    this.emitPlayers(socket);
    this.broadcastLevel(socket);
    this.sendStateTo(socket);
    this.sendYourCards();
  }

  leave(): void {
    if (this.humanLeft || this.finished) return;
    this.humanLeft = true;
    const seatIndex = this.humanSeatOnActiveTable();
    if (this.hand && !this.hand.isHandComplete() && seatIndex !== null && this.hand.getActingSeatIndex() === seatIndex) {
      this.handleAction(seatIndex, { kind: "fold" });
    }
  }

  // --- テーブル/席のヘルパー ---

  private humanTableId(): number | null {
    const mtt = this.mtt;
    if (!mtt) return null;
    for (const tableId of mtt.getTableIds()) {
      if (mtt.getTableOccupancy(tableId).some((o) => o.playerId === this.humanUserId)) return tableId;
    }
    return null;
  }

  private humanSeatOnActiveTable(): number | null {
    const mtt = this.mtt;
    if (!mtt || this.activeTableId === null) return null;
    const occupant = mtt.getTableOccupancy(this.activeTableId).find((o) => o.playerId === this.humanUserId);
    return occupant?.seatIndex ?? null;
  }

  private isHumanActiveTable(): boolean {
    return this.activeTableId !== null && this.activeTableId === this.humanTableId();
  }

  private isAccelerated(): boolean {
    return this.humanLeft || this.humanDone;
  }

  // --- 進行のメインループ ---

  /** 次にハンドを回す卓を決めて開始する。人間卓は対話進行、BOT卓は瞬時消化。 */
  private pump(): void {
    const mtt = this.mtt;
    if (!mtt || this.finished) return;
    if (mtt.isTournamentOver()) {
      void this.finishTournament();
      return;
    }

    const tableIds = mtt.getTableIds().filter((id) => mtt.getTableOccupancy(id).length >= 2);
    if (tableIds.length === 0) {
      void this.finishTournament();
      return;
    }
    const tableId = tableIds[this.tableRotation % tableIds.length]!;
    this.tableRotation += 1;

    this.activeTableId = tableId;
    this.hand = mtt.startNextHandOnTable(tableId);

    const humanHere = tableId === this.humanTableId() && !this.humanLeft && !this.humanDone;
    if (humanHere) {
      this.emitPlayers();
      this.broadcastState();
      this.sendYourCards();
      this.scheduleTurn();
    } else {
      this.driveInstantHand();
    }
  }

  /** BOTのみ(または人間離脱後)のハンドを同期的に最後まで消化する。 */
  private driveInstantHand(): void {
    const hand = this.hand;
    if (!hand) return;
    let guard = 0;
    while (!hand.isHandComplete() && guard++ < 500) {
      const acting = hand.getActingSeatIndex();
      if (acting === null) break;
      const playerId = hand.getPublicState().seats.find((s) => s.seatIndex === acting)?.playerId;
      const info = playerId ? this.playersById.get(playerId) : undefined;
      const isHuman = info ? !info.isBot : false;
      try {
        hand.applyAction(acting, isHuman ? { kind: "fold" } : this.computeBotAction(acting));
      } catch {
        hand.applyAction(acting, { kind: "fold" });
      }
    }
    void this.finishHand();
  }

  private handleAction(seatIndex: number, action: PlayerAction): void {
    const hand = this.hand;
    if (!hand || hand.isHandComplete()) return;
    if (hand.getActingSeatIndex() !== seatIndex) return;
    try {
      hand.applyAction(seatIndex, action);
    } catch (err) {
      const playerId = hand.getPublicState().seats.find((s) => s.seatIndex === seatIndex)?.playerId;
      const isBot = playerId ? (this.playersById.get(playerId)?.isBot ?? true) : true;
      if (isBot || this.humanLeft) {
        hand.applyAction(seatIndex, { kind: "fold" });
      } else {
        this.humanSocket?.emit("actionError", { message: (err as Error).message });
        return;
      }
    }
    if (this.isHumanActiveTable()) this.broadcastState();
    if (hand.isHandComplete()) {
      void this.finishHand();
    } else {
      this.scheduleTurn();
    }
  }

  private scheduleTurn(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    const hand = this.hand;
    if (!hand || hand.isHandComplete()) return;
    const actingSeat = hand.getActingSeatIndex();
    if (actingSeat === null) return;
    const playerId = hand.getPublicState().seats.find((s) => s.seatIndex === actingSeat)?.playerId;
    const info = playerId ? this.playersById.get(playerId) : undefined;
    if (!info) return;

    if (info.isBot || this.humanLeft) {
      const delay = this.isAccelerated() ? FAST_DELAY_MS : BOT_ACTION_DELAY_MS;
      this.turnTimer = setTimeout(() => {
        if (!this.hand || this.hand.isHandComplete() || this.hand.getActingSeatIndex() !== actingSeat) return;
        this.handleAction(actingSeat, info.isBot ? this.computeBotAction(actingSeat) : { kind: "fold" });
      }, delay);
      return;
    }

    const endsAt = Date.now() + ACTION_CLOCK_MS;
    this.io.to(this.roomId).emit("turnTimer", { seatIndex: actingSeat, endsAt, durationMs: ACTION_CLOCK_MS });
    this.turnTimer = setTimeout(() => {
      const current = this.hand;
      if (!current || current.isHandComplete() || current.getActingSeatIndex() !== actingSeat) return;
      const seat = current.getPublicState().seats.find((s) => s.seatIndex === actingSeat);
      const toCall = seat ? Math.max(0, current.getPublicState().currentBetToMatch - seat.streetContribution) : 0;
      this.handleAction(actingSeat, toCall <= 0 ? { kind: "check" } : { kind: "fold" });
    }, ACTION_CLOCK_MS);
  }

  private computeBotAction(seatIndex: number): PlayerAction {
    const hand = this.hand!;
    const state = hand.getPublicState();
    const seat = state.seats.find((s) => s.seatIndex === seatIndex)!;
    const holeCards = hand.getSeatHoleCards(seatIndex);
    if (holeCards.length !== 2) return { kind: "fold" };
    return decideBotAction({
      street: state.street,
      holeCards: holeCards as unknown as readonly [Card, Card],
      board: state.board,
      currentBetToMatch: state.currentBetToMatch,
      streetContribution: seat.streetContribution,
      minRaiseToAmount: hand.getMinRaiseToAmount(),
      potBefore: state.potTotal,
      stack: seat.stack,
      canRaise: !seat.hasActedThisStreet,
    });
  }

  private async finishHand(): Promise<void> {
    const mtt = this.mtt;
    const hand = this.hand;
    const tableId = this.activeTableId;
    if (!mtt || !hand || tableId === null || !this.dbTournamentId) return;

    const started = [...mtt.getEvents()].reverse().find((e) => e.type === "handStarted");
    const wasHumanTable = this.isHumanActiveTable();

    if (started && started.type === "handStarted") {
      const occupancy = mtt.getTableOccupancy(tableId);
      await recordHand({
        tournamentId: this.dbTournamentId,
        handNumber: started.handNumber,
        buttonFixedPos: started.buttonFixedPos,
        levelSmallBlind: started.level.smallBlind,
        levelBigBlind: started.level.bigBlind,
        levelAnte: started.level.bbAnte,
        seats: hand.getPublicState().seats.map((s) => ({
          seatIndex: s.seatIndex,
          userId: s.playerId,
          startingStack: occupancy.find((o) => o.seatIndex === s.seatIndex)?.stack ?? 0,
          isSmallBlind: s.seatIndex === started.smallBlindSeat,
          isBigBlind: s.seatIndex === started.bigBlindSeat,
        })),
        hand,
      }).catch((err) => console.error("[mtt] recordHand failed:", err));
    }

    mtt.settleFinishedHandOnTable(tableId, hand);
    const settled = [...mtt.getEvents()].reverse().find((e) => e.type === "handFinished");
    if (settled && settled.type === "handFinished") {
      this.bustedOrder.push(...settled.bustedPlayerIds);
    }

    if (wasHumanTable) {
      this.io.to(this.roomId).emit("handEnded", {
        result: this.serializeResult(hand),
        holeCards: Object.fromEntries([...hand.getAllHoleCards()].map(([seat, cards]) => [seat, cards.map(cardToString)])),
        remainingPlayers: mtt.totalRemainingPlayers(),
      });
    }

    this.hand = null;
    this.activeTableId = null;

    if (!this.humanDone && this.bustedOrder.includes(this.humanUserId)) {
      await this.recordHumanFinish();
    }

    if (mtt.isTournamentOver()) {
      void this.finishTournament();
      return;
    }

    // 高速消化モードではブラインドクロック(実時間)を待たず、一定ハンドごとにレベルを
    // 強制的に上げてBOT同士の消化を必ず収束させる。
    if (this.isAccelerated()) {
      this.acceleratedHands += 1;
      if (this.acceleratedHands % 10 === 0) mtt.advanceToNextLevel();
    }

    const delay = wasHumanTable && !this.isAccelerated() ? NEXT_HAND_DELAY_MS : FAST_DELAY_MS;
    setTimeout(() => this.pump(), delay);
  }

  private placeOf(playerId: string): number {
    const bustIndex = this.bustedOrder.indexOf(playerId);
    if (bustIndex === -1) return 1; // 未バスト = 優勝
    return this.fieldSize - bustIndex;
  }

  private async recordHumanFinish(): Promise<void> {
    if (this.humanResultRecorded || !this.dbTournamentId) return;
    this.humanResultRecorded = true;
    this.humanDone = true;

    const place = this.placeOf(this.humanUserId);
    const payout = computePayoutStructure(this.fieldSize, this.buyIn).find((p) => p.place === place)?.amount ?? 0;

    await prisma.tournamentEntry.updateMany({
      where: { tournamentId: this.dbTournamentId, userId: this.humanUserId },
      data: { finishPosition: place, payout },
    });
    if (payout > 0) {
      await recordPayout({ userId: this.humanUserId, tournamentId: this.dbTournamentId, amount: payout });
    }

    this.io.to(this.roomId).emit("tournamentOver", {
      winnerPlayerId: place === 1 ? this.humanUserId : null,
      yourFinishPosition: place,
      yourPayout: payout,
    });
  }

  private async finishTournament(): Promise<void> {
    const mtt = this.mtt;
    if (!mtt || !this.dbTournamentId || this.finished) return;
    this.finished = true;
    if (this.turnTimer) clearTimeout(this.turnTimer);

    if (!this.humanResultRecorded) {
      await this.recordHumanFinish();
    }

    const payoutByPlace = new Map(computePayoutStructure(this.fieldSize, this.buyIn).map((p) => [p.place, p.amount]));
    await Promise.all(
      [...this.playersById.values()]
        .filter((p) => p.userId !== this.humanUserId)
        .map(async (p) => {
          const place = this.placeOf(p.userId);
          await prisma.tournamentEntry.updateMany({
            where: { tournamentId: this.dbTournamentId!, userId: p.userId },
            data: { finishPosition: place, payout: payoutByPlace.get(place) ?? 0 },
          });
        }),
    );

    await prisma.tournament.update({
      where: { id: this.dbTournamentId },
      data: { status: "finished", finishedAt: new Date() },
    });
  }

  // --- ブラインドクロック ---

  private broadcastLevel(target?: Socket): void {
    const mtt = this.mtt;
    if (!mtt) return;
    const payload = { level: mtt.getCurrentLevel(), endsAt: this.levelEndsAt };
    (target ?? this.io.to(this.roomId)).emit("levelUp", payload);
  }

  private scheduleLevelAdvance(): void {
    const mtt = this.mtt;
    if (!mtt) return;
    const level = mtt.getCurrentLevel();
    this.levelEndsAt = Date.now() + level.durationMinutes * 60_000;
    this.broadcastLevel();
    setTimeout(() => {
      if (!this.mtt || this.mtt.isTournamentOver() || this.finished) return;
      this.mtt.advanceToNextLevel();
      this.scheduleLevelAdvance();
    }, level.durationMinutes * 60_000);
  }

  // --- 出力 ---

  private emitPlayers(target?: Socket): void {
    const mtt = this.mtt;
    const tableId = this.humanTableId();
    if (!mtt || tableId === null) return;
    const players = mtt.getTableOccupancy(tableId).map((o) => {
      const info = this.playersById.get(o.playerId);
      return {
        seatIndex: o.seatIndex,
        displayName: info?.displayName ?? o.playerId,
        avatarKey: info?.avatarKey ?? null,
        isBot: info?.isBot ?? true,
      };
    });
    (target ?? this.io.to(this.roomId)).emit("players", { players });
  }

  private broadcastState(): void {
    if (!this.hand) return;
    this.io.to(this.roomId).emit("state", this.hand.getPublicState());
  }

  private sendStateTo(socket: Socket): void {
    if (!this.hand || !this.isHumanActiveTable()) return;
    socket.emit("state", this.hand.getPublicState());
  }

  private sendYourCards(): void {
    const seatIndex = this.humanSeatOnActiveTable();
    if (!this.hand || seatIndex === null || !this.humanSocket) return;
    const cards = this.hand.getSeatHoleCards(seatIndex);
    this.humanSocket.emit("yourCards", { seatIndex, cards: cards.map(cardToString) });
  }

  private serializeResult(hand: HandEngine) {
    const result = hand.getResult();
    return {
      board: result.board.map(cardToString),
      pots: result.pots.map((p) => ({ amount: p.amount, eligiblePlayerIds: p.eligiblePlayerIds })),
      payouts: Object.fromEntries(result.payouts),
      wonByFold: result.wonByFold,
    };
  }
}
