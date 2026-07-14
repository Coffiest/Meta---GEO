import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { HandEngine, MultiTableTournament, cardToString, type Card, type PlayerAction } from "@meta-geo/engine";
import { prisma, recordHand, recordBuyIn, recordPayout, computeMttPrizeStructure, type PayoutPlace } from "@meta-geo/db";
import { decideBotAction } from "./bot.js";
import {
  ACTION_CLOCK_MS,
  TIME_BANK_EXTENSION_MS,
  MTT_TIME_BANK_CARDS,
  ensureBotUsers,
  scheduleStagedRunout,
  type HumanPlayer,
  type GameSession,
} from "./gameServer.js";
import { computeRevealedSeats } from "./showdown.js";

const BOT_ACTION_DELAY_MS = 900;
const NEXT_HAND_DELAY_MS = 3000;
const FAST_DELAY_MS = 20;
export const MTT_MIN_PLAYERS_TO_START = 4;
export const MTT_TABLE_SEAT_COUNT = 6;
export const MTT_BUY_IN = 2000;

interface PlayerInfo {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  isBot: boolean;
}

interface HumanEntry {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  socket: Socket | null;
  timeBankCards: number;
  timeBankArmed: boolean;
  /** 離席中(自動チェック/フォールド)。全員の座席に「離席中」を表示するため保持。 */
  away: boolean;
  left: boolean;
  done: boolean;
  /** 連続タイムアウト回数。2回連続で時間切れになると自動離席。自分でアクションすると0にリセット。 */
  consecutiveTimeouts: number;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  currentTableId: number | null;
}

/**
 * MTT(複数テーブル・レイトレジ対応)セッション。
 *
 * 仕組み:
 *  - 4人登録された時点で開始する。以降はレジストレーションクローズ(closeRegistration)まで
 *    誰でも途中参加(レイトレジ)できる。人数上限は無い。
 *  - レジクロ時点までの総エントリー数でプライズプールとペイアウト構造(WSOP準拠)を確定する。
 *    レジクロ後に参加していたプレイヤーがバストしていても、そのプレイヤーの着順は
 *    バスト順(=通常のトーナメント順位)としてそのまま有効。
 *  - 進行はロックステップ方式: 全体で同時に1ハンドだけをアクティブにし、卓を順番に回して
 *    1ハンドずつ消化する。誰かが着席している卓は対話的なペースで進行し、BOTのみの卓は
 *    瞬時に消化する。これによりハンド間だけで卓のバランシングが起きるというエンジンの
 *    前提を壊さず、複数の人間プレイヤーが別々の卓に同時に座っていても安全に進行できる。
 */
export class MttSession implements GameSession {
  private mtt: MultiTableTournament | null = null;
  private hand: HandEngine | null = null;
  private activeTableId: number | null = null;
  private dbTournamentId: string | null = null;
  private readonly playersById = new Map<string, PlayerInfo>();
  private readonly humans = new Map<string, HumanEntry>();
  private pendingRegistrants: HumanPlayer[] = [];
  private started = false;
  private registrationClosed = false;
  private finished = false;
  private entryCount = 0;
  private prizeStructure: PayoutPlace[] = [];
  private bustedOrder: string[] = [];
  /** 進行中のハンドがある卓から離脱した人間: そのハンドの精算直後に強制敗退させる対象。 */
  private readonly pendingForcedEliminations = new Set<string>();
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private levelEndsAt = 0;
  private tableRotation = 0;
  private acceleratedHands = 0;

  private readonly io: Server;
  readonly buyIn = MTT_BUY_IN;
  private readonly roomPrefix: string;

  constructor(io: Server) {
    this.io = io;
    this.roomPrefix = `mtt:${randomUUID()}`;
  }

  private tableRoom(tableId: number): string {
    return `${this.roomPrefix}:t${tableId}`;
  }

  isFinished(): boolean {
    return this.finished;
  }

  isRegistrationOpen(): boolean {
    return !this.registrationClosed;
  }

  entryCount_(): number {
    return this.entryCount;
  }

  isUserDone(userId: string): boolean {
    if (this.finished) return true;
    const h = this.humans.get(userId);
    return h ? h.done || h.left : false;
  }

  hasUser(userId: string): boolean {
    return this.humans.has(userId) || this.pendingRegistrants.some((p) => p.userId === userId);
  }

  /** 参加登録。4人未満なら開始待ち(pending)、開始後はレイトレジとして即着席する。 */
  async register(player: HumanPlayer, socket: Socket): Promise<void> {
    if (this.humans.has(player.userId)) {
      this.attachHuman(socket, player.userId);
      return;
    }
    if (this.registrationClosed) throw new Error("このトーナメントは登録を締め切りました");

    this.entryCount += 1;
    this.humans.set(player.userId, {
      userId: player.userId,
      displayName: player.displayName,
      avatarKey: player.avatarKey,
      socket,
      timeBankCards: MTT_TIME_BANK_CARDS,
      timeBankArmed: false,
      away: false,
      left: false,
      done: false,
      consecutiveTimeouts: 0,
      disconnectTimer: null,
      currentTableId: null,
    });
    this.playersById.set(player.userId, { ...player, isBot: false });
    this.wireHumanSocket(socket, player.userId);

    if (!this.started) {
      this.pendingRegistrants.push(player);
      if (!this.dbTournamentId) await this.ensureDbTournament();
      await recordBuyIn({ userId: player.userId, tournamentId: this.dbTournamentId!, amount: this.buyIn });
      socket.emit("mttWaiting", { registered: this.pendingRegistrants.length, needed: MTT_MIN_PLAYERS_TO_START });
      if (this.pendingRegistrants.length >= MTT_MIN_PLAYERS_TO_START) {
        await this.beginTournament();
      }
      return;
    }

    // レイトレジ: 既に進行中のトーナメントへ開始スタックで途中参加
    const assignment = this.mtt!.registerLatePlayer({ playerId: player.userId, displayName: player.displayName });
    this.humans.get(player.userId)!.currentTableId = assignment.tableId;
    void socket.join(this.tableRoom(assignment.tableId));
    await prisma.tournamentEntry.create({
      data: { tournamentId: this.dbTournamentId!, userId: player.userId, seatIndex: this.entryCount - 1 },
    });
    await recordBuyIn({ userId: player.userId, tournamentId: this.dbTournamentId!, amount: this.buyIn });
    this.emitPlayersForTable(assignment.tableId);
  }

  private async ensureDbTournament(): Promise<void> {
    if (this.dbTournamentId) return;
    const dbTournament = await prisma.tournament.create({
      data: { seatCount: MTT_TABLE_SEAT_COUNT, startingStack: 20_000, status: "running", gameType: "mtt", buyIn: this.buyIn },
    });
    this.dbTournamentId = dbTournament.id;
  }

  private async beginTournament(): Promise<void> {
    this.started = true;
    for (const p of this.pendingRegistrants) {
      const botCheck = this.playersById.get(p.userId);
      if (botCheck) botCheck.isBot = false;
    }

    this.mtt = new MultiTableTournament({
      tableSeatCount: MTT_TABLE_SEAT_COUNT,
      players: this.pendingRegistrants.map((p) => ({ playerId: p.userId, displayName: p.displayName })),
    });

    await prisma.tournamentEntry.createMany({
      data: this.pendingRegistrants.map((p, i) => ({ tournamentId: this.dbTournamentId!, userId: p.userId, seatIndex: i })),
    });

    this.syncHumanTables();
    this.scheduleLevelAdvance();
    this.pump();
  }

  attachHuman(socket: Socket, userId: string): void {
    const human = this.humans.get(userId);
    if (!human) return;
    human.socket = socket;
    if (human.disconnectTimer) {
      clearTimeout(human.disconnectTimer);
      human.disconnectTimer = null;
    }
    // 再接続したら離席状態を解除し、連続タイムアウトもリセット。
    human.consecutiveTimeouts = 0;
    if (human.away) {
      human.away = false;
      if (human.currentTableId !== null) this.emitPlayersForTable(human.currentTableId);
    }
    this.wireHumanSocket(socket, userId);
    if (human.currentTableId !== null) void socket.join(this.tableRoom(human.currentTableId));

    if (!this.started) {
      socket.emit("mttWaiting", { registered: this.pendingRegistrants.length, needed: MTT_MIN_PLAYERS_TO_START });
      return;
    }
    if (human.currentTableId !== null) this.emitPlayersForTable(human.currentTableId);
    socket.emit("levelUp", { level: this.mtt!.getCurrentLevel(), endsAt: this.levelEndsAt });
    socket.emit("timeBank", { cards: human.timeBankCards, armed: human.timeBankArmed });
    if (this.hand && human.currentTableId === this.activeTableId) {
      socket.emit("state", this.hand.getPublicState());
      const seatIndex = this.seatIndexOf(userId);
      if (seatIndex !== null) socket.emit("yourCards", { seatIndex, cards: this.hand.getSeatHoleCards(seatIndex).map(cardToString) });
    }
  }

  private wireHumanSocket(socket: Socket, userId: string): void {
    socket.removeAllListeners("action");
    socket.removeAllListeners("timeBankArm");
    socket.on("action", (action: PlayerAction) => {
      const human = this.humans.get(userId);
      if (human) {
        // 自分でアクションしたら連続タイムアウトをリセットし、離席状態なら復帰。
        human.consecutiveTimeouts = 0;
        if (human.away) {
          human.away = false;
          if (human.currentTableId !== null) this.emitPlayersForTable(human.currentTableId);
        }
      }
      const seatIndex = this.seatIndexOf(userId);
      if (seatIndex !== null) this.handleAction(seatIndex, action);
    });
    socket.on("timeBankArm", (payload: { armed?: boolean }) => {
      const human = this.humans.get(userId);
      if (human) human.timeBankArmed = Boolean(payload?.armed);
    });
    socket.on("sitOut", (payload: { away?: boolean }) => {
      const human = this.humans.get(userId);
      if (!human) return;
      human.away = Boolean(payload?.away);
      if (human.currentTableId !== null) this.emitPlayersForTable(human.currentTableId);
    });
    socket.on("disconnect", () => {
      const human = this.humans.get(userId);
      if (!human || human.socket !== socket) return;
      human.socket = null;
      // タスクキル/アプリ終了などで切断された場合は自動で離席状態にする。
      if (!human.away && !human.left) {
        human.away = true;
        if (human.currentTableId !== null) this.emitPlayersForTable(human.currentTableId);
      }
      human.disconnectTimer = setTimeout(() => {
        if (!human.socket) this.leave(userId);
      }, 60_000);
    });
  }

  leave(userId: string): void {
    const human = this.humans.get(userId);
    if (!human || this.finished || human.left) return;
    human.left = true;

    // チップを破棄しての離脱は即敗退扱いにする(自動フォールドで生き残らせない)。ロックステップ
    // 進行(同時に1ハンドしか動かない)なので、離脱した席の卓がまさに今ハンド進行中でなければ
    // その場で座席を解放して敗退確定できる。進行中なら、そのハンドを安全に精算し終えた直後
    // (finishHand側)で確実に処理する。
    const midHandOnTheirTable = Boolean(this.hand) && !this.hand!.isHandComplete() && human.currentTableId === this.activeTableId;
    if (midHandOnTheirTable) {
      const seatIndex = this.seatIndexOf(userId);
      if (seatIndex !== null && this.hand!.getActingSeatIndex() === seatIndex) {
        this.handleAction(seatIndex, { kind: "fold" });
      }
      this.pendingForcedEliminations.add(userId);
    } else {
      this.mtt?.forceEliminate(userId);
      if (!this.bustedOrder.includes(userId)) this.bustedOrder.push(userId);
      void this.recordHumanFinish(human);
    }
  }

  // --- テーブル/席のヘルパー ---

  private seatIndexOf(userId: string): number | null {
    const human = this.humans.get(userId);
    if (!human || human.currentTableId === null || !this.mtt) return null;
    const occupant = this.mtt.getTableOccupancy(human.currentTableId).find((o) => o.playerId === userId);
    return occupant?.seatIndex ?? null;
  }

  /** 全人間の現在の卓IDを実際のエンジン状態と同期し、必要ならソケットのルームを移動する。 */
  private syncHumanTables(): void {
    if (!this.mtt) return;
    for (const tableId of this.mtt.getTableIds()) {
      for (const occ of this.mtt.getTableOccupancy(tableId)) {
        const human = this.humans.get(occ.playerId);
        if (!human) continue;
        if (human.currentTableId !== tableId) {
          if (human.socket && human.currentTableId !== null) void human.socket.leave(this.tableRoom(human.currentTableId));
          human.currentTableId = tableId;
          if (human.socket) void human.socket.join(this.tableRoom(tableId));
          this.emitPlayersForTable(tableId);
        }
      }
    }
  }

  private tableHasHuman(tableId: number): boolean {
    for (const human of this.humans.values()) {
      if (human.currentTableId === tableId && !human.left && !human.done) return true;
    }
    return false;
  }

  // --- 進行のメインループ ---

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

    if (this.tableHasHuman(tableId)) {
      this.emitPlayersForTable(tableId);
      this.broadcastState();
      this.sendYourCardsForTable(tableId);
      this.scheduleTurn();
    } else {
      this.driveInstantHand();
    }
  }

  /** BOTのみ(または全員離脱済み)の卓のハンドを同期的に最後まで消化する。 */
  private driveInstantHand(): void {
    const hand = this.hand;
    if (!hand) return;
    let guard = 0;
    while (!hand.isHandComplete() && guard++ < 500) {
      const acting = hand.getActingSeatIndex();
      if (acting === null) break;
      const playerId = hand.getPublicState().seats.find((s) => s.seatIndex === acting)?.playerId;
      const human = playerId ? this.humans.get(playerId) : undefined;
      try {
        hand.applyAction(acting, human ? { kind: "fold" } : this.computeBotAction(acting));
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
    const playerId = hand.getPublicState().seats.find((s) => s.seatIndex === seatIndex)?.playerId;
    const human = playerId ? this.humans.get(playerId) : undefined;
    const boardLenBefore = hand.getPublicState().board.length;
    try {
      hand.applyAction(seatIndex, action);
    } catch (err) {
      if (!human || human.left) {
        hand.applyAction(seatIndex, { kind: "fold" });
      } else {
        human.socket?.emit("actionError", { message: (err as Error).message });
        return;
      }
    }
    const tableHasHuman = this.tableHasHuman(this.activeTableId!);
    if (hand.isHandComplete()) {
      const boardGrew = hand.getPublicState().board.length > boardLenBefore;
      // ボードが自動展開された=オールインでベッティングが閉じたケース。ルール上の順序どおり
      // 「先にショウダウン→ストリートごとにボード公開→結果処理」で配信する(人間がいる卓のみ)。
      if (boardGrew && tableHasHuman) {
        const room = this.tableRoom(this.activeTableId!);
        scheduleStagedRunout({
          hand,
          boardLenBefore,
          emitState: (state) => this.io.to(room).emit("state", state),
          emitShowdown: (holeCards) => this.io.to(room).emit("showdownReveal", { holeCards }),
          isStillCurrent: () => this.hand === hand && !this.finished,
          onDone: () => void this.finishHand(),
        });
      } else {
        if (tableHasHuman) this.broadcastState();
        void this.finishHand();
      }
    } else {
      if (tableHasHuman) this.broadcastState();
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
    const human = playerId ? this.humans.get(playerId) : undefined;

    if (!human) {
      const delay = this.tableHasHuman(this.activeTableId!) ? BOT_ACTION_DELAY_MS : FAST_DELAY_MS;
      this.turnTimer = setTimeout(() => {
        if (!this.hand || this.hand.isHandComplete() || this.hand.getActingSeatIndex() !== actingSeat) return;
        this.handleAction(actingSeat, this.computeBotAction(actingSeat));
      }, delay);
      return;
    }

    if (human.left) {
      this.turnTimer = setTimeout(() => {
        if (!this.hand || this.hand.isHandComplete() || this.hand.getActingSeatIndex() !== actingSeat) return;
        this.handleAction(actingSeat, { kind: "fold" });
      }, FAST_DELAY_MS);
      return;
    }

    this.armHumanClock(actingSeat, human, ACTION_CLOCK_MS);
  }

  private armHumanClock(actingSeat: number, human: HumanEntry, durationMs: number): void {
    const endsAt = Date.now() + durationMs;
    this.io.to(this.tableRoom(this.activeTableId!)).emit("turnTimer", { seatIndex: actingSeat, endsAt, durationMs });
    this.turnTimer = setTimeout(() => {
      const current = this.hand;
      if (!current || current.isHandComplete() || current.getActingSeatIndex() !== actingSeat) return;

      if (human.timeBankArmed && human.timeBankCards > 0 && !human.left) {
        human.timeBankCards -= 1;
        human.socket?.emit("timeBank", { cards: human.timeBankCards, armed: human.timeBankArmed, consumed: true });
        this.armHumanClock(actingSeat, human, TIME_BANK_EXTENSION_MS);
        return;
      }

      // 連続タイムアウトを数え、2回連続で時間切れになったら自動で離席状態にする。
      human.consecutiveTimeouts += 1;
      if (human.consecutiveTimeouts >= 2 && !human.away) {
        human.away = true;
        if (human.currentTableId !== null) this.emitPlayersForTable(human.currentTableId);
      }

      const seat = current.getPublicState().seats.find((s) => s.seatIndex === actingSeat);
      const toCall = seat ? Math.max(0, current.getPublicState().currentBetToMatch - seat.streetContribution) : 0;
      this.handleAction(actingSeat, toCall <= 0 ? { kind: "check" } : { kind: "fold" });
    }, durationMs);
  }

  private computeBotAction(seatIndex: number): PlayerAction {
    const hand = this.hand!;
    const state = hand.getPublicState();
    const seat = state.seats.find((s) => s.seatIndex === seatIndex)!;
    const holeCards = hand.getSeatHoleCards(seatIndex);
    if (holeCards.length !== 2) return { kind: "fold" };
    const activeOpponentCount = state.seats.filter(
      (s) => s.seatIndex !== seatIndex && (s.status === "active" || s.status === "allIn"),
    ).length;
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
      activeOpponentCount,
      bigBlind: this.mtt?.getCurrentLevel().bigBlind,
    });
  }

  private async finishHand(): Promise<void> {
    const mtt = this.mtt;
    const hand = this.hand;
    const tableId = this.activeTableId;
    if (!mtt || !hand || tableId === null || !this.dbTournamentId) return;

    const started = [...mtt.getEvents()].reverse().find((e) => e.type === "handStarted");
    const tableHadHuman = this.tableHasHuman(tableId);

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
          wasAway: this.humans.get(s.playerId)?.away ?? false,
        })),
        hand,
      }).catch((err) => console.error("[mtt] recordHand failed:", err));
    }

    if (tableHadHuman) {
      const revealedSeats = computeRevealedSeats(hand);
      const revealedHoleCards = Object.fromEntries(
        [...hand.getAllHoleCards()].filter(([seat]) => revealedSeats.has(seat)).map(([seat, cards]) => [seat, cards.map(cardToString)]),
      );
      this.io.to(this.tableRoom(tableId)).emit("handEnded", {
        result: this.serializeResult(hand),
        holeCards: revealedHoleCards,
        remainingPlayers: mtt.totalRemainingPlayers(),
      });
    }

    mtt.settleFinishedHandOnTable(tableId, hand);
    const settled = [...mtt.getEvents()].reverse().find((e) => e.type === "handFinished");
    if (settled && settled.type === "handFinished") {
      this.bustedOrder.push(...settled.bustedPlayerIds);
      for (const playerId of settled.bustedPlayerIds) {
        const human = this.humans.get(playerId);
        if (human && !human.done) await this.recordHumanFinish(human);
      }
    }

    // このハンド中に離脱した人間は、通常のバスト判定(スタック0)を待たず、ここで確実に敗退確定する。
    for (const playerId of [...this.pendingForcedEliminations]) {
      const human = this.humans.get(playerId);
      if (!human || human.currentTableId !== tableId) continue;
      this.pendingForcedEliminations.delete(playerId);
      if (human.done) continue;
      mtt.forceEliminate(playerId);
      if (!this.bustedOrder.includes(playerId)) this.bustedOrder.push(playerId);
      await this.recordHumanFinish(human);
    }

    this.hand = null;
    this.activeTableId = null;
    this.syncHumanTables();

    if (mtt.isTournamentOver()) {
      void this.finishTournament();
      return;
    }

    const anyoneActive = [...this.humans.values()].some((h) => !h.left && !h.done);
    if (!anyoneActive) {
      this.acceleratedHands += 1;
      if (this.acceleratedHands % 10 === 0) mtt.advanceToNextLevel();
    }

    const delay = tableHadHuman && anyoneActive ? NEXT_HAND_DELAY_MS : FAST_DELAY_MS;
    setTimeout(() => this.pump(), delay);
  }

  /** レジクロ(登録締切)。以降は新規登録・レイトレジを受け付けず、確定エントリー数でプライズを固定する。 */
  closeRegistration(): void {
    if (this.registrationClosed) return;
    this.registrationClosed = true;
    this.prizeStructure = computeMttPrizeStructure(Math.max(this.entryCount, 1), this.buyIn).places;
  }

  private placeOf(playerId: string): number {
    const bustIndex = this.bustedOrder.indexOf(playerId);
    if (bustIndex === -1) return 1; // 未バスト = 優勝
    return this.entryCount - bustIndex;
  }

  private async recordHumanFinish(human: HumanEntry): Promise<void> {
    if (human.done || !this.dbTournamentId) return;
    human.done = true;
    if (!this.registrationClosed) this.closeRegistration();

    const place = this.placeOf(human.userId);
    const payout = this.prizeStructure.find((p) => p.place === place)?.amount ?? 0;

    await prisma.tournamentEntry.updateMany({
      where: { tournamentId: this.dbTournamentId, userId: human.userId },
      data: { finishPosition: place, payout },
    });
    if (payout > 0) {
      await recordPayout({ userId: human.userId, tournamentId: this.dbTournamentId, amount: payout });
    }

    human.socket?.emit("tournamentOver", {
      winnerPlayerId: place === 1 ? human.userId : null,
      yourFinishPosition: place,
      yourPayout: payout,
    });
  }

  private async finishTournament(): Promise<void> {
    const mtt = this.mtt;
    if (!mtt || !this.dbTournamentId || this.finished) return;
    this.finished = true;
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (!this.registrationClosed) this.closeRegistration();

    for (const human of this.humans.values()) {
      if (!human.done) await this.recordHumanFinish(human);
    }

    const payoutByPlace = new Map(this.prizeStructure.map((p) => [p.place, p.amount]));
    await Promise.all(
      [...this.playersById.values()]
        .filter((p) => !this.humans.has(p.userId))
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

  private scheduleLevelAdvance(): void {
    const mtt = this.mtt;
    if (!mtt) return;
    const level = mtt.getCurrentLevel();
    this.levelEndsAt = Date.now() + level.durationMinutes * 60_000;
    this.io.to([...this.mtt!.getTableIds()].map((id) => this.tableRoom(id))).emit("levelUp", { level, endsAt: this.levelEndsAt });
    setTimeout(() => {
      if (!this.mtt || this.mtt.isTournamentOver() || this.finished) return;
      this.mtt.advanceToNextLevel();
      this.scheduleLevelAdvance();
    }, level.durationMinutes * 60_000);
  }

  // --- 出力 ---

  private emitPlayersForTable(tableId: number): void {
    const mtt = this.mtt;
    if (!mtt) return;
    const players = mtt.getTableOccupancy(tableId).map((o) => {
      const info = this.playersById.get(o.playerId);
      return {
        seatIndex: o.seatIndex,
        // MTTではplayerId=User.id。BOTの合成IDはクライアントでisBot判定して詳細を引かない。
        userId: o.playerId,
        displayName: info?.displayName ?? o.playerId,
        avatarKey: info?.avatarKey ?? null,
        isBot: info?.isBot ?? true,
        away: this.humans.get(o.playerId)?.away ?? false,
      };
    });
    this.io.to(this.tableRoom(tableId)).emit("players", { players });
  }

  private broadcastState(): void {
    if (!this.hand || this.activeTableId === null) return;
    this.io.to(this.tableRoom(this.activeTableId)).emit("state", this.hand.getPublicState());
  }

  private sendYourCardsForTable(tableId: number): void {
    if (!this.hand) return;
    for (const human of this.humans.values()) {
      if (human.currentTableId !== tableId || !human.socket) continue;
      const seatIndex = this.seatIndexOf(human.userId);
      if (seatIndex === null) continue;
      human.socket.emit("yourCards", { seatIndex, cards: this.hand.getSeatHoleCards(seatIndex).map(cardToString) });
    }
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
