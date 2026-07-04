import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { HandEngine, Tournament, cardToString, type Card, type PlayerAction } from "@meta-geo/engine";
import { prisma, recordHand, recordBuyIn, recordPayout, computePayoutStructure } from "@meta-geo/db";
import { decideBotAction } from "./bot.js";

const BOT_ACTION_DELAY_MS = 900;
const NEXT_HAND_DELAY_MS = 3500;
const BOT_NAMES = ["BOT-Akira", "BOT-Yuki", "BOT-Sora", "BOT-Rin", "BOT-Kai"];

interface SeatPlayer {
  readonly seatIndex: number;
  readonly userId: string;
  readonly displayName: string;
  readonly isBot: boolean;
}

export interface TableSessionConfig {
  readonly io: Server;
  readonly gameType: "sng" | "mtt";
  readonly buyIn: number;
  readonly seatCount: number;
  readonly humanUserId: string;
  readonly humanDisplayName: string;
}

/**
 * 1卓分のゲーム進行を管理する。ソロテスト用途のため、人間プレイヤーは1テーブルにつき1人までとし、
 * 残りの席は起動時にルールベースBOTで自動的に埋めて即座にトーナメントを開始する
 * (「システム側がゲームを用意し、プレイヤーが参加する」というロビーの仕組み上、マッチングは
 * まだ実装しておらず、参加するたびに専用の卓が新しく作られる)。
 */
export class TableSession {
  private tournament: Tournament | null = null;
  private hand: HandEngine | null = null;
  private dbTournamentId: string | null = null;
  private players = new Map<number, SeatPlayer>();
  private human: { seatIndex: number; socket: Socket } | null = null;
  private spectators = new Set<Socket>();
  private finished = false;

  readonly gameType: "sng" | "mtt";
  readonly buyIn: number;
  private readonly seatCount: number;
  private readonly humanUserId: string;
  private readonly humanDisplayName: string;
  private readonly io: Server;
  /** ロビーが複数のTableSessionを同時に扱えるよう、stateなどのbroadcastはこの卓専用のroomに限定する */
  private readonly roomId = `table:${randomUUID()}`;

  constructor(config: TableSessionConfig) {
    this.io = config.io;
    this.gameType = config.gameType;
    this.buyIn = config.buyIn;
    this.seatCount = config.seatCount;
    this.humanUserId = config.humanUserId;
    this.humanDisplayName = config.humanDisplayName;
  }

  isFinished(): boolean {
    return this.finished;
  }

  /** 新規参加: バイインを引いてトーナメントを作成し、BOTを着席させて即座に開始する。 */
  async start(): Promise<void> {
    const botUsers = await Promise.all(
      BOT_NAMES.map((name) =>
        prisma.user.upsert({
          where: { email: `${name}@bots.meta-geo.local` },
          update: {},
          create: { email: `${name}@bots.meta-geo.local`, displayName: name, isBot: true },
        }),
      ),
    );

    this.players.set(0, { seatIndex: 0, userId: this.humanUserId, displayName: this.humanDisplayName, isBot: false });
    botUsers.slice(0, this.seatCount - 1).forEach((u, i) => {
      this.players.set(i + 1, { seatIndex: i + 1, userId: u.id, displayName: u.displayName, isBot: true });
    });

    this.tournament = new Tournament({
      seatCount: this.seatCount,
      players: [...this.players.values()].map((p) => ({ playerId: p.userId, displayName: p.displayName, seatIndex: p.seatIndex })),
    });

    const dbTournament = await prisma.tournament.create({
      data: {
        seatCount: this.seatCount,
        startingStack: this.tournament.getSeats()[0]!.stack,
        status: "running",
        gameType: this.gameType,
        buyIn: this.buyIn,
      },
    });
    this.dbTournamentId = dbTournament.id;
    await prisma.tournamentEntry.createMany({
      data: [...this.players.values()].map((p) => ({ tournamentId: dbTournament.id, userId: p.userId, seatIndex: p.seatIndex })),
    });

    if (this.buyIn > 0) {
      await recordBuyIn({ userId: this.humanUserId, tournamentId: dbTournament.id, amount: this.buyIn });
    }

    this.io.to(this.roomId).emit("levelUp", { level: this.tournament.getCurrentLevel() });
    this.scheduleLevelAdvance();
    this.beginNextHand();
  }

  /** 同じ人間プレイヤーがこのテーブルへ再接続してきた場合、現在の状況を即座に送る。 */
  attachHuman(socket: Socket): void {
    this.human = { seatIndex: 0, socket };
    void socket.join(this.roomId);
    socket.on("action", (action: PlayerAction) => this.handlePlayerAction(0, action));
    socket.on("disconnect", () => {
      if (this.human?.socket === socket) this.human = null;
    });

    if (this.players.size > 0) socket.emit("players", { players: this.playersPayload() });
    if (this.tournament) socket.emit("levelUp", { level: this.tournament.getCurrentLevel() });
    this.sendStateTo(socket);
    if (this.hand) {
      const myCards = this.hand.getSeatHoleCards(0);
      socket.emit("yourCards", { seatIndex: 0, cards: myCards.map(cardToString) });
    }
  }

  attachSpectator(socket: Socket): void {
    this.spectators.add(socket);
    void socket.join(this.roomId);
    socket.emit("spectating", {});
    if (this.players.size > 0) socket.emit("players", { players: this.playersPayload() });
    this.sendStateTo(socket);
    socket.on("disconnect", () => this.spectators.delete(socket));
  }

  private playersPayload(): { seatIndex: number; displayName: string }[] {
    return [...this.players.values()].map((p) => ({ seatIndex: p.seatIndex, displayName: p.displayName }));
  }

  private scheduleLevelAdvance(): void {
    const tournament = this.tournament;
    if (!tournament) return;
    const level = tournament.getCurrentLevel();
    setTimeout(() => {
      if (!this.tournament || this.tournament.isTournamentOver()) return;
      this.tournament.advanceToNextLevel();
      this.io.to(this.roomId).emit("levelUp", { level: this.tournament.getCurrentLevel() });
      this.scheduleLevelAdvance();
    }, level.durationMinutes * 60_000);
  }

  private beginNextHand(): void {
    if (!this.tournament) return;
    if (this.tournament.isTournamentOver()) {
      void this.finishTournament();
      return;
    }
    this.hand = this.tournament.startNextHand();
    this.broadcastState();
    this.driveBotsOrWait();
  }

  private currentButtonInfo(): { smallBlindSeat: number | null; bigBlindSeat: number } {
    const events = this.tournament!.getEvents();
    const started = [...events].reverse().find((e) => e.type === "handStarted") as
      | { smallBlindSeat: number | null; bigBlindSeat: number }
      | undefined;
    return started ?? { smallBlindSeat: null, bigBlindSeat: 0 };
  }

  private handlePlayerAction(seatIndex: number, action: PlayerAction): void {
    const hand = this.hand;
    if (!hand || hand.isHandComplete()) return;
    if (hand.getActingSeatIndex() !== seatIndex) return;
    try {
      hand.applyAction(seatIndex, action);
    } catch (err) {
      const isBot = this.players.get(seatIndex)?.isBot ?? false;
      if (isBot) {
        // BOTの想定外の不正アクションでテーブルが止まらないよう、必ず合法なfoldにフォールバックする
        hand.applyAction(seatIndex, { kind: "fold" });
      } else {
        this.human?.socket.emit("actionError", { message: (err as Error).message });
        return;
      }
    }
    this.broadcastState();
    if (hand.isHandComplete()) {
      void this.finishHand();
    } else {
      this.driveBotsOrWait();
    }
  }

  private driveBotsOrWait(): void {
    const hand = this.hand;
    if (!hand || hand.isHandComplete()) return;
    const actingSeat = hand.getActingSeatIndex();
    if (actingSeat === null) return;
    const player = this.players.get(actingSeat);
    if (!player?.isBot) return; // 人間の番: ソケットからのactionイベントを待つ

    setTimeout(() => {
      if (!this.hand || this.hand.isHandComplete() || this.hand.getActingSeatIndex() !== actingSeat) return;
      const action = this.computeBotAction(actingSeat);
      this.handlePlayerAction(actingSeat, action);
    }, BOT_ACTION_DELAY_MS);
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
    const hand = this.hand;
    const tournament = this.tournament;
    if (!hand || !tournament || !this.dbTournamentId) return;

    const { smallBlindSeat, bigBlindSeat } = this.currentButtonInfo();
    const events = tournament.getEvents();
    const started = [...events].reverse().find((e) => e.type === "handStarted") as
      | { handNumber: number; level: { smallBlind: number; bigBlind: number; bbAnte: number }; buttonFixedPos: number }
      | undefined;

    if (started) {
      const startingStacks = new Map<number, number>();
      for (const seat of tournament.getSeats()) startingStacks.set(seat.seatIndex, seat.stack);

      await recordHand({
        tournamentId: this.dbTournamentId,
        handNumber: started.handNumber,
        buttonFixedPos: started.buttonFixedPos,
        levelSmallBlind: started.level.smallBlind,
        levelBigBlind: started.level.bigBlind,
        levelAnte: started.level.bbAnte,
        seats: [...this.players.values()].map((p) => ({
          seatIndex: p.seatIndex,
          userId: p.userId,
          startingStack: startingStacks.get(p.seatIndex) ?? 0,
          isSmallBlind: p.seatIndex === smallBlindSeat,
          isBigBlind: p.seatIndex === bigBlindSeat,
        })),
        hand,
      });
    }

    tournament.settleFinishedHand();
    this.io.to(this.roomId).emit("handEnded", {
      result: this.serializeResult(hand),
      holeCards: Object.fromEntries([...hand.getAllHoleCards()].map(([seat, cards]) => [seat, cards.map(cardToString)])),
    });

    if (tournament.isTournamentOver()) {
      void this.finishTournament();
      return;
    }

    setTimeout(() => this.beginNextHand(), NEXT_HAND_DELAY_MS);
  }

  /** トーナメント終了処理: 全席の着順を確定し、賞金配分をDB(TournamentEntry.payout)とバンクロール台帳に反映する。 */
  private async finishTournament(): Promise<void> {
    const tournament = this.tournament;
    if (!tournament || !this.dbTournamentId || this.finished) return;
    this.finished = true;

    // bustedAtHandが遅い(=nullなら優勝)ほど着順が良い、として並べる。
    const seats = [...tournament.getSeats()].sort((a, b) => {
      const aRank = a.bustedAtHand ?? Number.POSITIVE_INFINITY;
      const bRank = b.bustedAtHand ?? Number.POSITIVE_INFINITY;
      return bRank - aRank;
    });

    const payoutStructure = computePayoutStructure(seats.length, this.buyIn);
    const payoutByPlace = new Map(payoutStructure.map((p) => [p.place, p.amount]));

    await Promise.all(
      seats.map(async (seat, index) => {
        const place = index + 1;
        const payout = payoutByPlace.get(place) ?? 0;
        const player = this.players.get(seat.seatIndex);
        await prisma.tournamentEntry.updateMany({
          where: { tournamentId: this.dbTournamentId!, seatIndex: seat.seatIndex },
          data: { finishPosition: place, payout },
        });
        // BOTのバンクロールは意味を持たないため、人間プレイヤーの分だけ台帳に記帳する。
        if (payout > 0 && player && !player.isBot) {
          await recordPayout({ userId: player.userId, tournamentId: this.dbTournamentId!, amount: payout });
        }
      }),
    );

    await prisma.tournament.update({
      where: { id: this.dbTournamentId },
      data: { status: "finished", finishedAt: new Date() },
    });

    const humanSeat = seats.findIndex((s) => this.players.get(s.seatIndex)?.userId === this.humanUserId);
    const humanPlace = humanSeat === -1 ? null : humanSeat + 1;
    this.io.to(this.roomId).emit("tournamentOver", {
      winnerPlayerId: tournament.getWinnerPlayerId(),
      yourFinishPosition: humanPlace,
      yourPayout: humanPlace !== null ? (payoutByPlace.get(humanPlace) ?? 0) : 0,
    });
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

  private broadcastState(): void {
    if (!this.hand) return;
    const publicState = this.hand.getPublicState();
    this.io.to(this.roomId).emit("state", publicState);

    if (this.human) {
      const myCards = this.hand.getSeatHoleCards(this.human.seatIndex);
      // ショーダウン前でも自分自身のホールカードだけは常に見える
      this.human.socket.emit("yourCards", { seatIndex: this.human.seatIndex, cards: myCards.map(cardToString) });
    }
  }

  private sendStateTo(socket: Socket): void {
    if (!this.hand) return;
    socket.emit("state", this.hand.getPublicState());
  }
}
