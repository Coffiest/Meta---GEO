import type { Server, Socket } from "socket.io";
import { HandEngine, Tournament, cardToString, type Card, type PlayerAction } from "@meta-geo/engine";
import { prisma, recordHand } from "@meta-geo/db";
import { decideBotAction } from "./bot.js";

const SEAT_COUNT = 6;
const BOT_ACTION_DELAY_MS = 900;
const NEXT_HAND_DELAY_MS = 3500;
const BOT_NAMES = ["BOT-Akira", "BOT-Yuki", "BOT-Sora", "BOT-Rin", "BOT-Kai"];

interface SeatPlayer {
  readonly seatIndex: number;
  readonly userId: string;
  readonly displayName: string;
  readonly isBot: boolean;
}

/**
 * 1卓分のゲーム進行を管理する。ソロテスト用途のため、人間プレイヤーは1テーブルにつき1人までとし、
 * 残りの席は起動時にルールベースBOTで自動的に埋めて即座にトーナメントを開始する。
 */
export class TableSession {
  private tournament: Tournament | null = null;
  private hand: HandEngine | null = null;
  private dbTournamentId: string | null = null;
  private players = new Map<number, SeatPlayer>();
  private human: { seatIndex: number; socket: Socket } | null = null;
  private spectators = new Set<Socket>();
  private starting = false;

  constructor(private readonly io: Server) {}

  async handleConnection(socket: Socket): Promise<void> {
    if (this.human) {
      this.spectators.add(socket);
      socket.emit("spectating", {});
      this.sendStateTo(socket);
      socket.on("disconnect", () => this.spectators.delete(socket));
      return;
    }

    const displayName = typeof socket.handshake.auth?.["displayName"] === "string"
      ? (socket.handshake.auth["displayName"] as string)
      : `Guest-${socket.id.slice(0, 6)}`;
    const user = await prisma.user.create({ data: { displayName, isBot: false } });

    this.human = { seatIndex: 0, socket };
    socket.on("action", (action: PlayerAction) => this.handlePlayerAction(0, action));
    socket.on("disconnect", () => {
      if (this.human?.socket === socket) this.human = null;
    });

    await this.startTableIfNeeded(user.id, displayName);
  }

  private async startTableIfNeeded(humanUserId: string, humanDisplayName: string): Promise<void> {
    if (this.starting || this.tournament) return;
    this.starting = true;

    const botUsers = await Promise.all(
      BOT_NAMES.map((name) => prisma.user.upsert({ where: { email: `${name}@bots.meta-geo.local` }, update: {}, create: { email: `${name}@bots.meta-geo.local`, displayName: name, isBot: true } })),
    );

    this.players.set(0, { seatIndex: 0, userId: humanUserId, displayName: humanDisplayName, isBot: false });
    botUsers.forEach((u, i) => {
      this.players.set(i + 1, { seatIndex: i + 1, userId: u.id, displayName: u.displayName, isBot: true });
    });

    this.tournament = new Tournament({
      seatCount: SEAT_COUNT,
      players: [...this.players.values()].map((p) => ({ playerId: p.userId, displayName: p.displayName, seatIndex: p.seatIndex })),
    });

    const dbTournament = await prisma.tournament.create({
      data: { seatCount: SEAT_COUNT, startingStack: this.tournament.getSeats()[0]!.stack, status: "running" },
    });
    this.dbTournamentId = dbTournament.id;
    await prisma.tournamentEntry.createMany({
      data: [...this.players.values()].map((p) => ({ tournamentId: dbTournament.id, userId: p.userId, seatIndex: p.seatIndex })),
    });

    this.starting = false;
    this.scheduleLevelAdvance();
    this.beginNextHand();
  }

  private scheduleLevelAdvance(): void {
    const tournament = this.tournament;
    if (!tournament) return;
    const level = tournament.getCurrentLevel();
    setTimeout(() => {
      if (!this.tournament || this.tournament.isTournamentOver()) return;
      this.tournament.advanceToNextLevel();
      this.io.emit("levelUp", { level: this.tournament.getCurrentLevel() });
      this.scheduleLevelAdvance();
    }, level.durationMinutes * 60_000);
  }

  private beginNextHand(): void {
    if (!this.tournament) return;
    if (this.tournament.isTournamentOver()) {
      this.io.emit("tournamentOver", { winnerPlayerId: this.tournament.getWinnerPlayerId() });
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
    this.io.emit("handEnded", {
      result: this.serializeResult(hand),
      holeCards: Object.fromEntries([...hand.getAllHoleCards()].map(([seat, cards]) => [seat, cards.map(cardToString)])),
    });

    if (tournament.isTournamentOver()) {
      this.io.emit("tournamentOver", { winnerPlayerId: tournament.getWinnerPlayerId() });
      return;
    }

    setTimeout(() => this.beginNextHand(), NEXT_HAND_DELAY_MS);
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
    this.io.emit("state", publicState);

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
