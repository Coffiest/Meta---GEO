import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { HandEngine, Tournament, cardToString, type Card, type PlayerAction } from "@meta-geo/engine";
import { prisma, recordHand, recordBuyIn, recordPayout, computePayoutStructure } from "@meta-geo/db";
import { decideBotAction } from "./bot.js";

const BOT_ACTION_DELAY_MS = 900;
const NEXT_HAND_DELAY_MS = 3500;
/** 人間バスト後/離脱後にBOT同士の消化を高速化するときのディレイ */
const FAST_BOT_DELAY_MS = 25;
const FAST_NEXT_HAND_DELAY_MS = 50;
/** 人間の1アクションの持ち時間。切れたら自動チェック(不可ならフォールド)。 */
export const ACTION_CLOCK_MS = 20_000;

export const BOT_PROFILES = [
  { name: "BOT-Akira", avatarKey: "bot1" },
  { name: "BOT-Yuki", avatarKey: "bot2" },
  { name: "BOT-Sora", avatarKey: "bot3" },
  { name: "BOT-Rin", avatarKey: "bot4" },
  { name: "BOT-Kai", avatarKey: "bot5" },
  { name: "BOT-Hana", avatarKey: "bot6" },
  { name: "BOT-Ren", avatarKey: "bot1" },
  { name: "BOT-Mio", avatarKey: "bot2" },
  { name: "BOT-Gen", avatarKey: "bot3" },
  { name: "BOT-Tsumugi", avatarKey: "bot4" },
  { name: "BOT-Jin", avatarKey: "bot5" },
] as const;

/** BOT用のUserレコードを確保して返す(名前をキーにupsert)。 */
export async function ensureBotUsers(count: number): Promise<{ id: string; displayName: string; avatarKey: string }[]> {
  const profiles = BOT_PROFILES.slice(0, count);
  return Promise.all(
    profiles.map(async (p) => {
      const u = await prisma.user.upsert({
        where: { email: `${p.name}@bots.meta-geo.local` },
        update: { avatarKey: p.avatarKey },
        create: { email: `${p.name}@bots.meta-geo.local`, displayName: p.name, isBot: true, avatarKey: p.avatarKey },
      });
      return { id: u.id, displayName: u.displayName, avatarKey: p.avatarKey };
    }),
  );
}

interface SeatPlayer {
  readonly seatIndex: number;
  readonly userId: string;
  readonly displayName: string;
  readonly avatarKey: string | null;
  readonly isBot: boolean;
}

export interface TableSessionConfig {
  readonly io: Server;
  readonly gameType: "sng" | "mtt";
  readonly buyIn: number;
  readonly seatCount: number;
  readonly humanUserId: string;
  readonly humanDisplayName: string;
  readonly humanAvatarKey: string | null;
}

/** ロビーが扱うゲームセッションの共通インターフェース(SNG/MTT)。 */
export interface GameSession {
  isFinished(): boolean;
  /** 人間側の結果が確定済みか(バスト/離脱後、BOT消化中でもtrue)。trueなら新しいゲームに参加できる。 */
  isHumanDone(): boolean;
  start(): Promise<void>;
  attachHuman(socket: Socket): void;
  /** チップを破棄してゲームから離脱する(以降は自動フォールドで消化)。 */
  leave(): void;
}

/**
 * 1卓分(SNG)のゲーム進行を管理する。人間プレイヤーは1テーブルにつき1人までとし、
 * 残りの席は起動時にルールベースBOTで自動的に埋めて即座にトーナメントを開始する。
 */
export class TableSession implements GameSession {
  private tournament: Tournament | null = null;
  private hand: HandEngine | null = null;
  private dbTournamentId: string | null = null;
  private players = new Map<number, SeatPlayer>();
  private human: { seatIndex: number; socket: Socket } | null = null;
  private finished = false;
  private humanDone = false;
  private humanLeft = false;
  private humanResultRecorded = false;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private levelEndsAt = 0;
  private acceleratedHands = 0;

  readonly gameType: "sng" | "mtt";
  readonly buyIn: number;
  private readonly seatCount: number;
  private readonly humanUserId: string;
  private readonly humanDisplayName: string;
  private readonly humanAvatarKey: string | null;
  private readonly io: Server;
  /** ロビーが複数のTableSessionを同時に扱えるよう、broadcastはこの卓専用のroomに限定する */
  private readonly roomId = `table:${randomUUID()}`;

  constructor(config: TableSessionConfig) {
    this.io = config.io;
    this.gameType = config.gameType;
    this.buyIn = config.buyIn;
    this.seatCount = config.seatCount;
    this.humanUserId = config.humanUserId;
    this.humanDisplayName = config.humanDisplayName;
    this.humanAvatarKey = config.humanAvatarKey;
  }

  isFinished(): boolean {
    return this.finished;
  }

  isHumanDone(): boolean {
    return this.humanDone || this.finished;
  }

  /** 新規参加: バイインを記帳してトーナメントを作成し、BOTを着席させて即座に開始する。 */
  async start(): Promise<void> {
    const botUsers = await ensureBotUsers(this.seatCount - 1);

    this.players.set(0, {
      seatIndex: 0,
      userId: this.humanUserId,
      displayName: this.humanDisplayName,
      avatarKey: this.humanAvatarKey,
      isBot: false,
    });
    botUsers.forEach((u, i) => {
      this.players.set(i + 1, {
        seatIndex: i + 1,
        userId: u.id,
        displayName: u.displayName,
        avatarKey: u.avatarKey,
        isBot: true,
      });
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

    // attachHuman時点ではまだ着席が確定していないため、開始時にあらためて全席情報を配信する
    this.io.to(this.roomId).emit("players", { players: this.playersPayload() });
    this.broadcastLevel();
    this.scheduleLevelAdvance();
    this.beginNextHand();
  }

  /** 同じ人間プレイヤーがこのテーブルへ(再)接続してきた場合、現在の状況を即座に送る。 */
  attachHuman(socket: Socket): void {
    this.human = { seatIndex: 0, socket };
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    void socket.join(this.roomId);
    socket.on("action", (action: PlayerAction) => this.handlePlayerAction(0, action));
    socket.on("disconnect", () => {
      if (this.human?.socket !== socket) return;
      this.human = null;
      // 再接続されないまま60秒経ったら離脱扱いにする(20秒タイムアウトの空回りで
      // トーナメントが延々と残り続けるのを防ぐ)
      this.disconnectTimer = setTimeout(() => {
        if (!this.human) this.leave();
      }, 60_000);
    });

    if (this.players.size > 0) socket.emit("players", { players: this.playersPayload() });
    if (this.tournament) this.broadcastLevel(socket);
    this.sendStateTo(socket);
    if (this.hand) {
      const myCards = this.hand.getSeatHoleCards(0);
      socket.emit("yourCards", { seatIndex: 0, cards: myCards.map(cardToString) });
    }
  }

  leave(): void {
    if (this.humanLeft || this.finished) return;
    this.humanLeft = true;
    // 現在自分の番なら即フォールドし、以降の番も自動フォールドで消化される
    if (this.hand && !this.hand.isHandComplete() && this.hand.getActingSeatIndex() === 0) {
      this.handlePlayerAction(0, { kind: "fold" });
    }
  }

  private playersPayload(): { seatIndex: number; displayName: string; avatarKey: string | null; isBot: boolean }[] {
    return [...this.players.values()].map((p) => ({
      seatIndex: p.seatIndex,
      displayName: p.displayName,
      avatarKey: p.avatarKey,
      isBot: p.isBot,
    }));
  }

  private isAccelerated(): boolean {
    return this.humanLeft || this.humanDone;
  }

  private broadcastLevel(target?: Socket): void {
    if (!this.tournament) return;
    const payload = { level: this.tournament.getCurrentLevel(), endsAt: this.levelEndsAt };
    (target ?? this.io.to(this.roomId)).emit("levelUp", payload);
  }

  private scheduleLevelAdvance(): void {
    const tournament = this.tournament;
    if (!tournament) return;
    const level = tournament.getCurrentLevel();
    this.levelEndsAt = Date.now() + level.durationMinutes * 60_000;
    this.broadcastLevel();
    setTimeout(() => {
      if (!this.tournament || this.tournament.isTournamentOver() || this.finished) return;
      this.tournament.advanceToNextLevel();
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
    this.scheduleTurn();
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
      if (isBot || this.humanLeft) {
        // 想定外の不正アクションでテーブルが止まらないよう、必ず合法なfoldにフォールバックする
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
      this.scheduleTurn();
    }
  }

  /**
   * 手番の進行管理。BOTの番ならディレイ後に自動アクション、人間の番なら持ち時間タイマーを起動し、
   * 時間切れで自動チェック(チェック不可ならフォールド)する。離脱済みの人間は即フォールド。
   */
  private scheduleTurn(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    const hand = this.hand;
    if (!hand || hand.isHandComplete()) return;
    const actingSeat = hand.getActingSeatIndex();
    if (actingSeat === null) return;
    const player = this.players.get(actingSeat);
    if (!player) return;

    if (player.isBot) {
      const delay = this.isAccelerated() ? FAST_BOT_DELAY_MS : BOT_ACTION_DELAY_MS;
      this.turnTimer = setTimeout(() => {
        if (!this.hand || this.hand.isHandComplete() || this.hand.getActingSeatIndex() !== actingSeat) return;
        this.handlePlayerAction(actingSeat, this.computeBotAction(actingSeat));
      }, delay);
      return;
    }

    if (this.humanLeft) {
      this.turnTimer = setTimeout(() => {
        if (!this.hand || this.hand.isHandComplete() || this.hand.getActingSeatIndex() !== actingSeat) return;
        this.handlePlayerAction(actingSeat, { kind: "fold" });
      }, FAST_BOT_DELAY_MS);
      return;
    }

    // 人間の番: 持ち時間リングを表示させ、時間切れで自動チェック/フォールド
    const endsAt = Date.now() + ACTION_CLOCK_MS;
    this.io.to(this.roomId).emit("turnTimer", { seatIndex: actingSeat, endsAt, durationMs: ACTION_CLOCK_MS });
    this.turnTimer = setTimeout(() => {
      const current = this.hand;
      if (!current || current.isHandComplete() || current.getActingSeatIndex() !== actingSeat) return;
      const seat = current.getPublicState().seats.find((s) => s.seatIndex === actingSeat);
      const toCall = seat ? Math.max(0, current.getPublicState().currentBetToMatch - seat.streetContribution) : 0;
      this.handlePlayerAction(actingSeat, toCall <= 0 ? { kind: "check" } : { kind: "fold" });
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
        seats: [...this.players.values()]
          .filter((p) => tournament.getSeats().find((s) => s.seatIndex === p.seatIndex && s.bustedAtHand === null))
          .map((p) => ({
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

    // 人間がこのハンドでバストしたら、その時点で着順・賞金を確定して通知する
    const humanSeat = tournament.getSeats().find((s) => s.seatIndex === 0);
    if (!this.humanDone && humanSeat && humanSeat.bustedAtHand !== null) {
      await this.recordHumanFinish();
    }

    if (tournament.isTournamentOver()) {
      void this.finishTournament();
      return;
    }

    // 高速消化モードではブラインドクロック(実時間)を待たず、一定ハンドごとにレベルを
    // 強制的に上げてBOT同士の消化を必ず収束させる。
    if (this.isAccelerated()) {
      this.acceleratedHands += 1;
      if (this.acceleratedHands % 10 === 0) tournament.advanceToNextLevel();
    }

    const delay = this.isAccelerated() ? FAST_NEXT_HAND_DELAY_MS : NEXT_HAND_DELAY_MS;
    setTimeout(() => this.beginNextHand(), delay);
  }

  /** 人間の着順確定(バスト時 or 優勝時)。賞金を台帳とエントリーに記帳し、本人へ通知する。 */
  private async recordHumanFinish(): Promise<void> {
    const tournament = this.tournament;
    if (!tournament || !this.dbTournamentId || this.humanResultRecorded) return;
    this.humanResultRecorded = true;
    this.humanDone = true;

    const humanSeat = tournament.getSeats().find((s) => s.seatIndex === 0)!;
    // バスト済みなら残り人数+1が着順、優勝(未バスト)なら1位
    const remaining = tournament.getSeats().filter((s) => s.bustedAtHand === null).length;
    const place = humanSeat.bustedAtHand === null ? 1 : remaining + 1;
    const payout = computePayoutStructure(this.seatCount, this.buyIn).find((p) => p.place === place)?.amount ?? 0;

    await prisma.tournamentEntry.updateMany({
      where: { tournamentId: this.dbTournamentId, seatIndex: 0 },
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

  /** トーナメント終了処理: 全席の着順を確定し、賞金配分をDBに反映する。 */
  private async finishTournament(): Promise<void> {
    const tournament = this.tournament;
    if (!tournament || !this.dbTournamentId || this.finished) return;
    this.finished = true;
    if (this.turnTimer) clearTimeout(this.turnTimer);

    if (!this.humanResultRecorded) {
      await this.recordHumanFinish();
    }

    // bustedAtHandが遅い(=nullなら優勝)ほど着順が良い、として並べる。
    const seats = [...tournament.getSeats()].sort((a, b) => {
      const aRank = a.bustedAtHand ?? Number.POSITIVE_INFINITY;
      const bRank = b.bustedAtHand ?? Number.POSITIVE_INFINITY;
      return bRank - aRank;
    });

    const payoutByPlace = new Map(computePayoutStructure(this.seatCount, this.buyIn).map((p) => [p.place, p.amount]));

    await Promise.all(
      seats.map(async (seat, index) => {
        if (seat.seatIndex === 0) return; // 人間はrecordHumanFinishで確定済み
        const place = index + 1;
        await prisma.tournamentEntry.updateMany({
          where: { tournamentId: this.dbTournamentId!, seatIndex: seat.seatIndex },
          data: { finishPosition: place, payout: payoutByPlace.get(place) ?? 0 },
        });
      }),
    );

    await prisma.tournament.update({
      where: { id: this.dbTournamentId },
      data: { status: "finished", finishedAt: new Date() },
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
