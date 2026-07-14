import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { HandEngine, Tournament, cardToString, type Card, type PlayerAction, type PublicHandState } from "@meta-geo/engine";
import { prisma, recordHand, recordBuyIn, recordPayout, SNG_PAYOUTS } from "@meta-geo/db";
import { decideBotAction } from "./bot.js";
import { computeRevealedSeats } from "./showdown.js";

const BOT_ACTION_DELAY_MS = 900;
const NEXT_HAND_DELAY_MS = 3500;
/** 全人間の結果確定後にBOT同士の消化を高速化するときのディレイ */
const FAST_BOT_DELAY_MS = 25;
const FAST_NEXT_HAND_DELAY_MS = 50;
/** 1アクションの基本持ち時間(ショットクロック) */
export const ACTION_CLOCK_MS = 20_000;
/** タイムバンクカード1枚で追加される考慮時間 */
export const TIME_BANK_EXTENSION_MS = 30_000;
/** SNG/MTTのタイムバンクカード枚数 */
export const SNG_TIME_BANK_CARDS = 5;
export const MTT_TIME_BANK_CARDS = 10;
export const SNG_BUY_IN = 1000;
export const SNG_SEAT_COUNT = 6;
/** オールインランアウト: 手札をテーブルアップしてから最初のストリートが開くまでの待ち時間 */
export const SHOWDOWN_TABLE_PAUSE_MS = 1400;
/** オールインランアウト: ストリート1つ開くごとの待ち時間 */
export const RUNOUT_STREET_PAUSE_MS = 1100;

// BOTの5キャラクター。1卓に最大5体入っても全員別名になる。MTTの卓移動/追加補充では
// (offset+i) % 5 で循環参照するため、無限に生成しても破綻しない(別卓では同名が出てよい)。
export const BOT_PROFILES = [
  { name: "ラフくん", avatarKey: "bot1" },
  { name: "バリィ", avatarKey: "bot2" },
  { name: "ターンデットくん", avatarKey: "bot3" },
  { name: "リバーに住む魔物", avatarKey: "bot4" },
  { name: "ラフ&バリィ", avatarKey: "bot5" },
] as const;

export interface StagedRunoutParams {
  hand: HandEngine;
  /** オールインコールが成立した時点(=残りボード展開前)のボード枚数 */
  boardLenBefore: number;
  emitState: (state: PublicHandState) => void;
  emitShowdown: (holeCards: Record<number, string[]>) => void;
  /** ディレイ後もまだこのハンド/セッションが生きているか(次のハンドに進んでいたら中断) */
  isStillCurrent: () => boolean;
  onDone: () => void;
}

/**
 * オールインでベッティングが閉じてハンドが完了した場合の公開順の演出。TDAルール16
 * 「プレイヤーがオールインで他全員のベッティングアクションが完了したら、残りのボードが
 * 配られる前に全ハンドを直ちにテーブルアップする」に従い、
 *  1) ボードは増やさずに、公開義務のある全員の手札を先にテーブルアップ(showdownReveal)
 *  2) フロップ/ターン/リバーを1ストリートずつ間を置いて公開
 *  3) 最後に結果処理(handEnded)へ進む
 * の順でクライアントへ配信する。エンジン自体は既に完了済みなので、途中経過のstateは
 * 最終stateのボードを切り詰めたスナップショットとして合成する。
 */
export function scheduleStagedRunout(params: StagedRunoutParams): void {
  const finalState = params.hand.getPublicState();
  const stateAt = (boardLen: number): PublicHandState => ({
    ...finalState,
    board: finalState.board.slice(0, boardLen),
    isComplete: false,
  });

  // 1) まずショウダウン: ボードはオールイン成立時点のまま、手札だけを公開する
  params.emitState(stateAt(params.boardLenBefore));
  const revealedSeats = computeRevealedSeats(params.hand);
  const holeCards = Object.fromEntries(
    [...params.hand.getAllHoleCards()]
      .filter(([seat]) => revealedSeats.has(seat))
      .map(([seat, cards]) => [seat, cards.map(cardToString)]),
  );
  params.emitShowdown(holeCards);

  // 2) 残りのストリートを1つずつ公開し、3) 最後に結果処理へ進む
  let delay = SHOWDOWN_TABLE_PAUSE_MS;
  for (const boardLen of [3, 4, 5]) {
    if (boardLen <= params.boardLenBefore || boardLen > finalState.board.length) continue;
    const at = delay;
    setTimeout(() => {
      if (params.isStillCurrent()) params.emitState(stateAt(boardLen));
    }, at);
    delay += RUNOUT_STREET_PAUSE_MS;
  }
  setTimeout(() => {
    if (params.isStillCurrent()) params.onDone();
  }, delay);
}

/** BOT用のUserレコードを確保して返す(名前をキーにupsert)。offsetで別グループのBOTを取れる。 */
export async function ensureBotUsers(
  count: number,
  offset = 0,
): Promise<{ id: string; displayName: string; avatarKey: string }[]> {
  const profiles = Array.from({ length: count }, (_, i) => BOT_PROFILES[(offset + i) % BOT_PROFILES.length]!);
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

export interface HumanPlayer {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarKey: string | null;
}

interface HumanSeat {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarKey: string | null;
  socket: Socket | null;
  timeBankCards: number;
  timeBankArmed: boolean;
  /** 離席中(自動チェック/フォールド)。他プレイヤーの画面にも「離席中」を表示するため
   * サーバーが状態を保持しplayersペイロードでブロードキャストする。 */
  away: boolean;
  left: boolean;
  done: boolean;
  /** 連続タイムアウト回数。2回連続でアクションが時間切れになると自動で離席状態にする。
   * 自分でアクションすると0にリセット。 */
  consecutiveTimeouts: number;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
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
  readonly seatCount: number;
  readonly humans: HumanPlayer[];
}

/** ロビーが扱うゲームセッションの共通インターフェース(SNG/MTT)。 */
export interface GameSession {
  isFinished(): boolean;
  /** 指定ユーザーの結果が確定済みか(バスト/離脱後)。trueなら新しいゲームに参加できる。 */
  isUserDone(userId: string): boolean;
  attachHuman(socket: Socket, userId: string): void;
  /** チップを破棄してゲームから離脱する(以降は自動フォールドで消化)。 */
  leave(userId: string): void;
}

/**
 * 1卓分(SNG)のゲーム進行を管理する。マッチングで集まった複数の人間プレイヤー+BOTで
 * 6人卓を構成する。プライズは固定(1位$4,000 / 2位$2,000)。
 */
export class TableSession implements GameSession {
  private tournament: Tournament | null = null;
  private hand: HandEngine | null = null;
  private dbTournamentId: string | null = null;
  private players = new Map<number, SeatPlayer>();
  private humansBySeat = new Map<number, HumanSeat>();
  private finished = false;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private levelEndsAt = 0;
  private acceleratedHands = 0;

  readonly gameType = "sng";
  readonly buyIn = SNG_BUY_IN;
  private readonly seatCount: number;
  private readonly configHumans: HumanPlayer[];
  private readonly io: Server;
  private readonly roomId = `table:${randomUUID()}`;

  constructor(config: TableSessionConfig) {
    this.io = config.io;
    this.seatCount = config.seatCount;
    this.configHumans = config.humans;

    // 人間の席とHumanSeatはコンストラクタで同期的に確保する(start()を待つとattachHumanが
    // start()より先に呼ばれた場合に無視されてしまうため)。BOT席とトーナメント作成は
    // start()側で非同期に行う。
    this.configHumans.forEach((h, i) => {
      this.players.set(i, { seatIndex: i, userId: h.userId, displayName: h.displayName, avatarKey: h.avatarKey, isBot: false });
      this.humansBySeat.set(i, {
        userId: h.userId,
        displayName: h.displayName,
        avatarKey: h.avatarKey,
        socket: null,
        timeBankCards: SNG_TIME_BANK_CARDS,
        timeBankArmed: false,
        away: false,
        left: false,
        done: false,
        consecutiveTimeouts: 0,
        disconnectTimer: null,
      });
    });
  }

  isFinished(): boolean {
    return this.finished;
  }

  isUserDone(userId: string): boolean {
    if (this.finished) return true;
    const h = [...this.humansBySeat.values()].find((x) => x.userId === userId);
    return h ? h.done || h.left : true;
  }

  private allHumansDone(): boolean {
    return [...this.humansBySeat.values()].every((h) => h.done || h.left);
  }

  /** マッチング完了後に呼ばれる: 残りの席をBOTで埋めてトーナメントを即座に開始する。 */
  async start(): Promise<void> {
    const botCount = this.seatCount - this.configHumans.length;
    const botUsers = await ensureBotUsers(botCount);
    botUsers.forEach((u, i) => {
      const seatIndex = this.configHumans.length + i;
      this.players.set(seatIndex, { seatIndex, userId: u.id, displayName: u.displayName, avatarKey: u.avatarKey, isBot: true });
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

    for (const h of this.configHumans) {
      await recordBuyIn({ userId: h.userId, tournamentId: dbTournament.id, amount: this.buyIn });
    }

    this.io.to(this.roomId).emit("players", { players: this.playersPayload() });
    this.scheduleLevelAdvance();
    this.beginNextHand();
  }

  attachHuman(socket: Socket, userId: string): void {
    const entry = [...this.humansBySeat.entries()].find(([, h]) => h.userId === userId);
    if (!entry) return;
    const [seatIndex, human] = entry;
    human.socket = socket;
    if (human.disconnectTimer) {
      clearTimeout(human.disconnectTimer);
      human.disconnectTimer = null;
    }
    // 再接続したら離席状態を解除し、連続タイムアウトもリセット(戻ってきたので通常プレイに復帰)。
    human.consecutiveTimeouts = 0;
    if (human.away) {
      human.away = false;
      this.io.to(this.roomId).emit("players", { players: this.playersPayload() });
    }
    void socket.join(this.roomId);
    socket.on("action", (action: PlayerAction) => {
      // 自分でアクションしたら連続タイムアウトをリセット。タイムアウトで離席状態になっていた
      // 場合は自動的に復帰させる(全員の画面の「離席中」も解除)。
      human.consecutiveTimeouts = 0;
      if (human.away) {
        human.away = false;
        this.io.to(this.roomId).emit("players", { players: this.playersPayload() });
      }
      this.handlePlayerAction(seatIndex, action);
    });
    socket.on("timeBankArm", (payload: { armed?: boolean }) => {
      human.timeBankArmed = Boolean(payload?.armed);
    });
    socket.on("sitOut", (payload: { away?: boolean }) => {
      human.away = Boolean(payload?.away);
      // 離席状態は全員の画面に反映する(座席に「離席中」を表示するため)。
      this.io.to(this.roomId).emit("players", { players: this.playersPayload() });
    });
    socket.on("disconnect", () => {
      if (human.socket !== socket) return;
      human.socket = null;
      // タスクキル/アプリ終了などで切断された場合は自動で離席状態にする(全員の画面に「離席中」表示)。
      if (!human.away && !human.left) {
        human.away = true;
        this.io.to(this.roomId).emit("players", { players: this.playersPayload() });
      }
      // 再接続されないまま60秒経ったら離脱扱いにする
      human.disconnectTimer = setTimeout(() => {
        if (!human.socket) this.leave(userId);
      }, 60_000);
    });

    if (this.players.size > 0) socket.emit("players", { players: this.playersPayload() });
    if (this.tournament) socket.emit("levelUp", { level: this.tournament.getCurrentLevel(), endsAt: this.levelEndsAt });
    this.broadcastTournamentInfo();
    socket.emit("timeBank", { cards: human.timeBankCards, armed: human.timeBankArmed });
    if (this.hand) {
      socket.emit("state", this.hand.getPublicState());
      socket.emit("yourCards", { seatIndex, cards: this.hand.getSeatHoleCards(seatIndex).map(cardToString) });
    }
  }

  leave(userId: string): void {
    const entry = [...this.humansBySeat.entries()].find(([, h]) => h.userId === userId);
    if (!entry || this.finished) return;
    const [seatIndex, human] = entry;
    if (human.left) return;
    human.left = true;
    // チップを破棄しての離脱は即敗退扱いにする(自動フォールドで生き残らせない)。
    this.tournament?.forceEliminate(seatIndex);
    if (this.hand && !this.hand.isHandComplete() && this.hand.getActingSeatIndex() === seatIndex) {
      this.handlePlayerAction(seatIndex, { kind: "fold" });
    }
  }

  private playersPayload(): { seatIndex: number; userId: string; displayName: string; avatarKey: string | null; isBot: boolean; away: boolean }[] {
    return [...this.players.values()].map((p) => ({
      seatIndex: p.seatIndex,
      // BOTのuserIdは合成IDなのでクライアント側では詳細スタッツを引かない(isBotで判定)。
      userId: p.userId,
      displayName: p.displayName,
      avatarKey: p.avatarKey,
      isBot: p.isBot,
      away: this.humansBySeat.get(p.seatIndex)?.away ?? false,
    }));
  }

  /** トーナメントクロック画面用の集計情報(残り人数/総数/アベレージスタック/プライズ)を配信する。 */
  private broadcastTournamentInfo(): void {
    if (!this.tournament) return;
    const seats = this.tournament.getSeats();
    const alive = seats.filter((s) => s.bustedAtHand === null);
    const remaining = alive.length;
    const totalChips = alive.reduce((sum, s) => sum + s.stack, 0);
    const averageStack = remaining > 0 ? Math.round(totalChips / remaining) : 0;
    this.io.to(this.roomId).emit("tournamentInfo", {
      remaining,
      total: seats.length,
      averageStack,
      prizePool: SNG_PAYOUTS,
    });
  }

  private isAccelerated(): boolean {
    return this.allHumansDone();
  }

  private scheduleLevelAdvance(): void {
    const tournament = this.tournament;
    if (!tournament) return;
    const level = tournament.getCurrentLevel();
    this.levelEndsAt = Date.now() + level.durationMinutes * 60_000;
    this.io.to(this.roomId).emit("levelUp", { level, endsAt: this.levelEndsAt });
    this.broadcastTournamentInfo();
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
    this.broadcastTournamentInfo();
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
    const human = this.humansBySeat.get(seatIndex);
    const boardLenBefore = hand.getPublicState().board.length;
    try {
      hand.applyAction(seatIndex, action);
    } catch (err) {
      if (!human || human.left) {
        // 想定外の不正アクションでテーブルが止まらないよう、必ず合法なfoldにフォールバックする
        hand.applyAction(seatIndex, { kind: "fold" });
      } else {
        human.socket?.emit("actionError", { message: (err as Error).message });
        return;
      }
    }
    if (hand.isHandComplete()) {
      const boardGrew = hand.getPublicState().board.length > boardLenBefore;
      // ボードが自動展開された=オールインでベッティングが閉じたケース。ルール上の順序どおり
      // 「先にショウダウン→ストリートごとにボード公開→結果処理」で配信する。
      // 全人間の結果確定後の高速消化中は演出を省いて即座に処理する。
      if (boardGrew && !this.isAccelerated()) {
        scheduleStagedRunout({
          hand,
          boardLenBefore,
          emitState: (state) => this.io.to(this.roomId).emit("state", state),
          emitShowdown: (holeCards) => this.io.to(this.roomId).emit("showdownReveal", { holeCards }),
          isStillCurrent: () => this.hand === hand && !this.finished,
          onDone: () => void this.finishHand(),
        });
      } else {
        this.broadcastState();
        void this.finishHand();
      }
    } else {
      this.broadcastState();
      this.scheduleTurn();
    }
  }

  /**
   * 手番の進行管理。BOTはディレイ後に自動アクション。人間はショットクロック(20秒)を起動し、
   * 時間切れ時にタイムバンクカードが有効(チェックON)なら1枚消費して30秒延長、
   * 使えなければ自動チェック(不可ならフォールド)。
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
    const human = this.humansBySeat.get(actingSeat);

    if (!human) {
      const delay = this.isAccelerated() ? FAST_BOT_DELAY_MS : BOT_ACTION_DELAY_MS;
      this.turnTimer = setTimeout(() => {
        if (!this.hand || this.hand.isHandComplete() || this.hand.getActingSeatIndex() !== actingSeat) return;
        this.handlePlayerAction(actingSeat, this.computeBotAction(actingSeat));
      }, delay);
      return;
    }

    if (human.left) {
      this.turnTimer = setTimeout(() => {
        if (!this.hand || this.hand.isHandComplete() || this.hand.getActingSeatIndex() !== actingSeat) return;
        this.handlePlayerAction(actingSeat, { kind: "fold" });
      }, FAST_BOT_DELAY_MS);
      return;
    }

    this.armHumanClock(actingSeat, human, ACTION_CLOCK_MS);
  }

  private armHumanClock(actingSeat: number, human: HumanSeat, durationMs: number): void {
    const endsAt = Date.now() + durationMs;
    this.io.to(this.roomId).emit("turnTimer", { seatIndex: actingSeat, endsAt, durationMs });
    this.turnTimer = setTimeout(() => {
      const current = this.hand;
      if (!current || current.isHandComplete() || current.getActingSeatIndex() !== actingSeat) return;

      // タイムバンクカード: チェックONかつ残枚数があれば1枚消費して延長
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
        this.io.to(this.roomId).emit("players", { players: this.playersPayload() });
      }

      const seat = current.getPublicState().seats.find((s) => s.seatIndex === actingSeat);
      const toCall = seat ? Math.max(0, current.getPublicState().currentBetToMatch - seat.streetContribution) : 0;
      this.handlePlayerAction(actingSeat, toCall <= 0 ? { kind: "check" } : { kind: "fold" });
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
      bigBlind: this.tournament?.getCurrentLevel().bigBlind,
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
            wasAway: this.humansBySeat.get(p.seatIndex)?.away ?? false,
          })),
        hand,
      }).catch((err) => console.error("[sng] recordHand failed:", err));
    }

    // 公開義務のある席だけをクライアントへ公開する(それ以外はマック)
    const revealedSeats = computeRevealedSeats(hand);
    const revealedHoleCards = Object.fromEntries(
      [...hand.getAllHoleCards()].filter(([seat]) => revealedSeats.has(seat)).map(([seat, cards]) => [seat, cards.map(cardToString)]),
    );

    tournament.settleFinishedHand();
    this.io.to(this.roomId).emit("handEnded", {
      result: this.serializeResult(hand),
      holeCards: revealedHoleCards,
    });

    // このハンドでバストした人間の着順・賞金を確定して個別に通知する
    for (const [seatIndex, human] of this.humansBySeat) {
      const seat = tournament.getSeats().find((s) => s.seatIndex === seatIndex);
      if (!human.done && seat && seat.bustedAtHand !== null) {
        await this.recordHumanFinish(seatIndex, human);
      }
    }

    if (tournament.isTournamentOver()) {
      void this.finishTournament();
      return;
    }

    if (this.isAccelerated()) {
      this.acceleratedHands += 1;
      if (this.acceleratedHands % 10 === 0) tournament.advanceToNextLevel();
    }

    const delay = this.isAccelerated() ? FAST_NEXT_HAND_DELAY_MS : NEXT_HAND_DELAY_MS;
    setTimeout(() => this.beginNextHand(), delay);
  }

  /** 指定人間の着順確定(バスト時 or 優勝時)。SNG固定プライズを記帳し、本人へ通知する。 */
  private async recordHumanFinish(seatIndex: number, human: HumanSeat): Promise<void> {
    const tournament = this.tournament;
    if (!tournament || !this.dbTournamentId || human.done) return;
    human.done = true;

    const seat = tournament.getSeats().find((s) => s.seatIndex === seatIndex)!;
    const remaining = tournament.getSeats().filter((s) => s.bustedAtHand === null).length;
    const place = seat.bustedAtHand === null ? 1 : remaining + 1;
    const payout = SNG_PAYOUTS.find((p) => p.place === place)?.amount ?? 0;

    await prisma.tournamentEntry.updateMany({
      where: { tournamentId: this.dbTournamentId, seatIndex },
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
    const tournament = this.tournament;
    if (!tournament || !this.dbTournamentId || this.finished) return;
    this.finished = true;
    if (this.turnTimer) clearTimeout(this.turnTimer);

    for (const [seatIndex, human] of this.humansBySeat) {
      if (!human.done) await this.recordHumanFinish(seatIndex, human);
    }

    // bustedAtHandが遅い(=nullなら優勝)ほど着順が良い、として並べる。
    const seats = [...tournament.getSeats()].sort((a, b) => {
      const aRank = a.bustedAtHand ?? Number.POSITIVE_INFINITY;
      const bRank = b.bustedAtHand ?? Number.POSITIVE_INFINITY;
      return bRank - aRank;
    });

    await Promise.all(
      seats.map(async (seat, index) => {
        if (this.humansBySeat.has(seat.seatIndex)) return; // 人間はrecordHumanFinishで確定済み
        const place = index + 1;
        await prisma.tournamentEntry.updateMany({
          where: { tournamentId: this.dbTournamentId!, seatIndex: seat.seatIndex },
          data: { finishPosition: place, payout: SNG_PAYOUTS.find((p) => p.place === place)?.amount ?? 0 },
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
    this.io.to(this.roomId).emit("state", this.hand.getPublicState());

    for (const [seatIndex, human] of this.humansBySeat) {
      if (!human.socket) continue;
      // ショーダウン前でも自分自身のホールカードだけは常に見える
      human.socket.emit("yourCards", { seatIndex, cards: this.hand.getSeatHoleCards(seatIndex).map(cardToString) });
    }
  }
}
