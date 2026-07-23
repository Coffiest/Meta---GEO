import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { HandEngine, MultiTableTournament, cardToString, type Card, type PlayerAction } from "@meta-geo/engine";
import { prisma, recordHand, recordBuyIn, recordPayout, computeMttPrizeStructure, type PayoutPlace } from "@meta-geo/db";
import { decideBotAction, lastAggressorSeat } from "./bot.js";
import {
  ACTION_CLOCK_MS,
  TIME_BANK_EXTENSION_MS,
  MTT_TIME_BANK_CARDS,
  botDecisionMs,
  buildSeatAction,
  ensureBotUsers,
  scheduleStagedRunout,
  sanitizeChatText,
  type HumanPlayer,
  type GameSession,
  type ChatMessage,
} from "./gameServer.js";
import { computeRevealedSeats } from "./showdown.js";
import { activeGames } from "./activeGames.js";

const NEXT_HAND_DELAY_MS = 3000;
const FAST_DELAY_MS = 20;
export const MTT_MIN_PLAYERS_TO_START = 4;
export const MTT_TABLE_SEAT_COUNT = 6;
export const MTT_BUY_IN = 2000;
/** 最初の登録から、ボット補充して4人で開始するまでのマッチング時間(15秒)。 */
export const MTT_MATCH_WINDOW_MS = 15_000;
/** フィールド上限(ボット補充・リエントリはこの生存人数を超えない)。初期10〜15人+レイトレジ用に余裕を持たせる。 */
export const MTT_FIELD_CAP = 24;
/** 開始時に必ず賑わうよう、初期フィールドは10〜15人。人間の不足分をボットで補充する(人間が多ければボットは減る/ゼロ)。 */
export const MTT_INITIAL_FIELD_MIN = 10;
export const MTT_INITIAL_FIELD_MAX = 15;
/** レジストレーションクローズまでの時間(スタートから15分)。 */
export const MTT_REG_DURATION_MS = 15 * 60_000;
/** ボット補充の判定間隔(3分)。直近3分に人間の新規参加が0ならボットを1〜2名足す。 */
export const MTT_BOT_TOPUP_INTERVAL_MS = 3 * 60_000;
/** MTTのブラインドレベル時間(3分)。SNGは5分だが、MTTはRC=15分でBB=1,000(=20BB)に届くよう短縮。 */
export const MTT_LEVEL_DURATION_MS = 3 * 60_000;

interface PlayerInfo {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  isBot: boolean;
}

/**
 * 1卓ぶんの進行状態(全卓並行進行のための単位)。各卓が独立して自分の `hand` と
 * ターンクロック(`turnTimer`)を持ち、他卓を待たずに自分のハンドループを回す。
 * `pumpScheduled` は「次ハンドの開始が予約済み(setTimeout中)」フラグで、二重起動を防ぐ。
 */
interface TableRuntime {
  readonly tableId: number;
  hand: HandEngine | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  pumpScheduled: boolean;
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
 *  - 進行は全卓並行方式: 各卓が独立して自分のハンドループ(`pumpTable`)を回し、他卓を待たない
 *    (実MTTと同じ挙動)。人間が着席している卓は対話的なペースで、BOTのみの卓は瞬時に消化する。
 *    卓横断の共有状態(ブラインドレベル・バスト順・テーブルバランス/ブレイク)は `engineLock` で
 *    直列化し、並行する精算どうしが座席移動・卓消滅で競合しないようにする。精算時には「今ハンドが
 *    動いている他卓」を `busyTableIds` としてエンジンへ渡し、進行中の卓を解体・移動元にしない。
 */
export class MttSession implements GameSession {
  private mtt: MultiTableTournament | null = null;
  /** 卓ごとの進行状態(全卓並行進行)。tableId → その卓のハンド/クロック。 */
  private readonly runtimes = new Map<number, TableRuntime>();
  /**
   * エンジンの共有状態(座席・テーブルバランス/ブレイク・バスト順)を変更する処理を
   * トーナメント単位で直列化するためのロック。並行進行する各卓の精算が同時に
   * 座席を動かして競合するのを防ぐ。
   */
  private engineLock: Promise<unknown> = Promise.resolve();
  /** リエントリ時に「元の卓・元の席」を希望するための、各人間の直近の着席位置。 */
  private readonly lastSeatByUser = new Map<string, { tableId: number; seatIndex: number }>();
  private dbTournamentId: string | null = null;
  private readonly playersById = new Map<string, PlayerInfo>();
  /** 卓ごとの同卓チャットログ(直近50件)。 */
  private readonly chatLogByTable = new Map<number, ChatMessage[]>();
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
  private levelEndsAt = 0;
  private acceleratedHands = 0;
  /** 15秒マッチング→ボット補充で開始するためのタイマー。 */
  private matchTimer: ReturnType<typeof setTimeout> | null = null;
  /** 3分ごとのボット補充タイマー。 */
  private topupTimer: ReturnType<typeof setInterval> | null = null;
  /** レジクローズ(スタート+15分)タイマー。 */
  private regCloseTimer: ReturnType<typeof setTimeout> | null = null;
  /** 直近の補充判定以降に新規参加した実人間の数(0なら次のtickでボット補充)。 */
  private humanEntriesSinceLastTopup = 0;
  /** レジクローズまでの締切時刻(epoch ms)。RC前のクライアント表示用。0=未スタート。 */
  private registrationClosesAt = 0;

  private readonly io: Server;
  readonly buyIn = MTT_BUY_IN;
  private readonly roomPrefix: string;
  /** レジクローズした瞬間に呼ばれる(スケジューラが次の募集MTTを開くため)。 */
  private readonly onRegistrationClosed: (() => void) | undefined;

  constructor(io: Server, onRegistrationClosed?: () => void) {
    this.io = io;
    this.roomPrefix = `mtt:${randomUUID()}`;
    this.onRegistrationClosed = onRegistrationClosed;
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
        // 4人(実人間)が集まった瞬間に即開始。
        await this.beginWithBotFill();
      } else if (!this.matchTimer) {
        // 最初の登録者から15秒後に、足りない分をボットで補充して開始する。
        this.matchTimer = setTimeout(() => void this.beginWithBotFill(), MTT_MATCH_WINDOW_MS);
      }
      return;
    }

    // レイトレジ: 既に進行中のトーナメントへ開始スタックで途中参加(進行中の卓は動かさない)
    this.humanEntriesSinceLastTopup += 1;
    const assignment = await this.runExclusive(() =>
      this.mtt!.registerLatePlayer({ playerId: player.userId, displayName: player.displayName }, this.busyTableIds()),
    );
    this.humans.get(player.userId)!.currentTableId = assignment.tableId;
    void socket.join(this.tableRoom(assignment.tableId));
    await prisma.tournamentEntry.create({
      data: { tournamentId: this.dbTournamentId!, userId: player.userId, seatIndex: this.entryCount - 1 },
    });
    await recordBuyIn({ userId: player.userId, tournamentId: this.dbTournamentId!, amount: this.buyIn });
    this.emitPlayersForTable(assignment.tableId);
    this.broadcastTournamentInfo();
    this.reconcileTables();
  }

  /**
   * ボットを補充して開始する。開始時のフィールドが最低10〜15人(ランダム)になるよう、実人間の不足分を
   * 新規ボットで埋めてから開始する。人間がどれだけ少なくても常に10人以上で賑わい、人間が多ければ
   * ボットは少なく(またはゼロ)なる。15秒マッチング満了時、または実人間が規定数集まった瞬間に呼ばれる。
   */
  private async beginWithBotFill(): Promise<void> {
    if (this.started) return;
    if (this.matchTimer) {
      clearTimeout(this.matchTimer);
      this.matchTimer = null;
    }
    // 初期フィールド目標: 10〜15人のランダム。人間の不足分だけボットで補充する。
    const target =
      MTT_INITIAL_FIELD_MIN + Math.floor(Math.random() * (MTT_INITIAL_FIELD_MAX - MTT_INITIAL_FIELD_MIN + 1));
    const need = Math.max(0, target - this.pendingRegistrants.length);
    if (need > 0) {
      const bots = await this.freshBots(need);
      for (const b of bots) {
        this.entryCount += 1;
        this.playersById.set(b.id, { userId: b.id, displayName: b.displayName, avatarKey: b.avatarKey, isBot: true });
        this.pendingRegistrants.push({ userId: b.id, displayName: b.displayName, avatarKey: b.avatarKey });
      }
    }
    await this.beginTournament();
  }

  /** 既にこのトーナメントに参加していないボットUserを count 体返す(名前重複を避ける)。 */
  private async freshBots(count: number): Promise<{ id: string; displayName: string; avatarKey: string | null }[]> {
    const pool = await ensureBotUsers(MTT_FIELD_CAP);
    return pool.filter((b) => !this.playersById.has(b.id)).slice(0, count);
  }

  /** 現在の生存人数(全卓の着席者合計)。フィールド上限判定に使う。 */
  private aliveCount(): number {
    if (!this.mtt) return this.pendingRegistrants.length;
    let n = 0;
    for (const tid of this.mtt.getTableIds()) n += this.mtt.getTableOccupancy(tid).length;
    return n;
  }

  /**
   * ボットを1体、進行中トーナメントへレイトレジ着席させる(補充・リエントリ共通)。
   * `registerLatePlayer` はエンジンの座席を変更するため、呼び出し側で `engineLock` の
   * 排他区間内から呼ぶこと(進行中の卓を動かさないよう `busyTableIds` を渡す)。
   */
  private addLateBot(b: { id: string; displayName: string; avatarKey: string | null }): void {
    if (!this.mtt || this.registrationClosed || !this.dbTournamentId) return;
    this.entryCount += 1;
    this.playersById.set(b.id, { userId: b.id, displayName: b.displayName, avatarKey: b.avatarKey, isBot: true });
    const assignment = this.mtt.registerLatePlayer({ playerId: b.id, displayName: b.displayName }, this.busyTableIds());
    void prisma.tournamentEntry
      .create({ data: { tournamentId: this.dbTournamentId, userId: b.id, seatIndex: this.entryCount - 1 } })
      .catch(() => {});
    this.emitPlayersForTable(assignment.tableId);
  }

  /**
   * 3分ごとの補充判定。直近3分に実人間の新規参加が0で、フィールドが上限未満なら
   * ボットを1〜2名レイトレジさせて場を維持する。
   */
  private async botTopupTick(): Promise<void> {
    if (this.finished || this.registrationClosed || !this.mtt) return;
    const newHumans = this.humanEntriesSinceLastTopup;
    this.humanEntriesSinceLastTopup = 0;
    if (newHumans > 0) return;
    const room = MTT_FIELD_CAP - this.aliveCount();
    if (room <= 0) return;
    const want = Math.min(room, Math.random() < 0.5 ? 1 : 2);
    const bots = await this.freshBots(want);
    for (const b of bots) this.addLateBot(b);
    if (bots.length > 0) this.broadcastTournamentInfo();
  }

  private async ensureDbTournament(): Promise<void> {
    if (this.dbTournamentId) return;
    const dbTournament = await prisma.tournament.create({
      data: { seatCount: MTT_TABLE_SEAT_COUNT, startingStack: 20_000, status: "running", gameType: "mtt", buyIn: this.buyIn },
    });
    this.dbTournamentId = dbTournament.id;
  }

  private async beginTournament(): Promise<void> {
    if (this.started) return;
    this.started = true;
    // playersById.isBot は登録時に正しく設定済み(人間=false, ボット=true)。ここで上書きしない。

    this.mtt = new MultiTableTournament({
      tableSeatCount: MTT_TABLE_SEAT_COUNT,
      players: this.pendingRegistrants.map((p) => ({ playerId: p.userId, displayName: p.displayName })),
    });

    await prisma.tournamentEntry.createMany({
      data: this.pendingRegistrants.map((p, i) => ({ tournamentId: this.dbTournamentId!, userId: p.userId, seatIndex: i })),
    });

    // レジクローズはスタートから15分後。以降は新規参加・レイトレジ・リエントリ不可。
    this.registrationClosesAt = Date.now() + MTT_REG_DURATION_MS;
    this.regCloseTimer = setTimeout(() => this.closeRegistration(), MTT_REG_DURATION_MS);
    // 3分ごとにボット補充を判定(直近3分に人間の新規参加が無ければ1〜2名足す)。
    this.topupTimer = setInterval(() => void this.botTopupTick(), MTT_BOT_TOPUP_INTERVAL_MS);

    this.syncHumanTables();
    this.scheduleLevelAdvance();
    this.startAllTables();
  }

  /** エンジンの共有状態を変更する処理を直列化して実行する(卓横断の座席移動・卓消滅の競合防止)。 */
  private runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = this.engineLock.then(() => fn());
    this.engineLock = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /** 卓の進行状態を取得(無ければ生成)。 */
  private runtime(tableId: number): TableRuntime {
    let rt = this.runtimes.get(tableId);
    if (!rt) {
      rt = { tableId, hand: null, turnTimer: null, pumpScheduled: false };
      this.runtimes.set(tableId, rt);
    }
    return rt;
  }

  /** 今ハンドが進行中の卓の集合(`exclude` は除く)。テーブルバランス時にこれらを動かさない。 */
  private busyTableIds(exclude?: number): Set<number> {
    const s = new Set<number>();
    for (const [tid, rt] of this.runtimes) {
      if (tid === exclude) continue;
      if (rt.hand && !rt.hand.isHandComplete()) s.add(tid);
    }
    return s;
  }

  attachHuman(socket: Socket, userId: string): void {
    const human = this.humans.get(userId);
    if (!human) return;
    human.socket = socket;
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
    this.broadcastTournamentInfo();
    if (human.currentTableId !== null) {
      const log = this.chatLogByTable.get(human.currentTableId);
      if (log && log.length > 0) socket.emit("chatLog", { messages: log });
    }
    socket.emit("timeBank", { cards: human.timeBankCards, armed: human.timeBankArmed });
    const rt = human.currentTableId !== null ? this.runtimes.get(human.currentTableId) : undefined;
    if (rt?.hand && !rt.hand.isHandComplete()) {
      socket.emit("state", rt.hand.getPublicState());
      const seatIndex = this.seatIndexOf(userId);
      if (seatIndex !== null) socket.emit("yourCards", { seatIndex, cards: rt.hand.getSeatHoleCards(seatIndex).map(cardToString) });
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
      const rt = human?.currentTableId != null ? this.runtimes.get(human.currentTableId) : undefined;
      if (!rt) return;
      const seatIndex = this.seatIndexOf(userId);
      if (seatIndex !== null) this.handleAction(rt, seatIndex, action);
    });
    socket.on("timeBankArm", (payload: { armed?: boolean }) => {
      const human = this.humans.get(userId);
      if (human) human.timeBankArmed = Boolean(payload?.armed);
    });
    socket.on("reEntry", () => void this.handleReEntry(userId));
    socket.on("sitOut", (payload: { away?: boolean }) => {
      const human = this.humans.get(userId);
      if (!human) return;
      human.away = Boolean(payload?.away);
      if (human.currentTableId !== null) this.emitPlayersForTable(human.currentTableId);
    });
    socket.on("chat", (payload: { text?: string }) => {
      const human = this.humans.get(userId);
      const text = sanitizeChatText(payload?.text);
      if (!human || human.currentTableId === null || !text) return;
      const seatIndex = this.seatIndexOf(userId);
      if (seatIndex === null) return;
      const tableId = human.currentTableId;
      const msg: ChatMessage = { seatIndex, userId, displayName: human.displayName, text, ts: Date.now() };
      const log = this.chatLogByTable.get(tableId) ?? [];
      log.push(msg);
      if (log.length > 50) log.shift();
      this.chatLogByTable.set(tableId, log);
      this.io.to(this.tableRoom(tableId)).emit("chat", msg);
    });
    socket.on("disconnect", () => {
      const human = this.humans.get(userId);
      if (!human || human.socket !== socket) return;
      human.socket = null;
      // タスクキル/アプリ終了/リフレッシュなどで切断された場合は自動で離席状態にする。手番は
      // 時間切れで自動処理されるが、席は保持し続ける。
      if (!human.away && !human.left) {
        human.away = true;
        if (human.currentTableId !== null) this.emitPlayersForTable(human.currentTableId);
      }
      // 重要: 切断だけでは絶対にトーナメントから離脱させない(オーナー指示)。リフレッシュや一時的な
      // 回線断でチップを失わないよう、離脱は「チップ破棄」ボタン(明示的なleaveGame)かバスト時のみ。
    });
  }

  leave(userId: string): void {
    const human = this.humans.get(userId);
    if (!human || this.finished || human.left) return;
    human.left = true;

    // チップを破棄しての離脱は即敗退扱いにする(自動フォールドで生き残らせない)。離脱した席の卓が
    // まさに今ハンド進行中なら、そのハンドを安全に精算し終えた直後(finishHand側)で確実に処理する。
    // 進行中でなければ、その場で座席を解放して敗退確定できる(進行中の他卓は動かさない)。
    const rt = human.currentTableId !== null ? this.runtimes.get(human.currentTableId) : undefined;
    const midHandOnTheirTable = Boolean(rt?.hand) && !rt!.hand!.isHandComplete();
    if (midHandOnTheirTable && rt) {
      const seatIndex = this.seatIndexOf(userId);
      if (seatIndex !== null && rt.hand!.getActingSeatIndex() === seatIndex) {
        this.handleAction(rt, seatIndex, { kind: "fold" });
      }
      this.pendingForcedEliminations.add(userId);
    } else {
      void this.runExclusive(() => {
        this.mtt?.forceEliminate(userId, this.busyTableIds());
      }).then(() => {
        if (!this.bustedOrder.includes(userId)) this.bustedOrder.push(userId);
        void this.recordHumanFinish(human);
        this.syncHumanTables();
        this.pruneRuntimes();
        this.reconcileTables();
      });
    }
  }

  /**
   * リエントリ。バスト済みの人間が、レジクローズ前かつ場が満員でなければ、-2,000を払って
   * 開始スタックで復帰する。バスト状態を解除し、レイトレジと同様に着席し直す。
   */
  private async handleReEntry(userId: string): Promise<void> {
    if (this.finished || this.registrationClosed || !this.mtt || !this.dbTournamentId) return;
    const human = this.humans.get(userId);
    if (!human || !human.done) return; // バスト済み(done)のみリエントリ可
    if (this.aliveCount() >= MTT_FIELD_CAP) {
      human.socket?.emit("actionError", { message: "満員のため今はリエントリできません" });
      return;
    }

    // 参加費(-2,000)を記録し、新規エントリーとして数える。
    this.entryCount += 1;
    this.humanEntriesSinceLastTopup += 1;
    await recordBuyIn({ userId, tournamentId: this.dbTournamentId, amount: this.buyIn }).catch(() => {});
    await prisma.tournamentEntry
      .create({ data: { tournamentId: this.dbTournamentId, userId, seatIndex: this.entryCount - 1 } })
      .catch(() => {});

    // バスト状態を解除して復帰。順位計算のためバスト順からも除く。
    human.done = false;
    human.left = false;
    human.away = false;
    human.consecutiveTimeouts = 0;
    const bi = this.bustedOrder.indexOf(userId);
    if (bi !== -1) this.bustedOrder.splice(bi, 1);

    // 開始スタックで着席し直す。可能なら元の卓・元の席へ(空いていて進行中でなければ)、
    // 無ければ最少人数卓へ。進行中の卓は動かさない。
    const pref = this.lastSeatByUser.get(userId);
    const assignment = await this.runExclusive(() =>
      this.mtt!.registerLatePlayer({ playerId: userId, displayName: human.displayName }, this.busyTableIds(), pref),
    );
    human.currentTableId = assignment.tableId;
    if (human.socket) void human.socket.join(this.tableRoom(assignment.tableId));

    human.socket?.emit("reEntered", { seatIndex: assignment.seatIndex, tableId: assignment.tableId, stack: 20_000 });
    this.emitPlayersForTable(assignment.tableId);
    this.broadcastTournamentInfo();
    this.reconcileTables();
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
          // 別の卓から移動した場合(初回着席=nullは除く)は、テーブル移動を本人へ通知する。
          const wasMoved = human.currentTableId !== null;
          if (human.socket && human.currentTableId !== null) void human.socket.leave(this.tableRoom(human.currentTableId));
          human.currentTableId = tableId;
          if (human.socket) void human.socket.join(this.tableRoom(tableId));
          this.emitPlayersForTable(tableId);
          if (wasMoved) {
            human.socket?.emit("tableNotice", { kind: "moved", message: "テーブルが移動しました" });
          }
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

  // --- 進行のメインループ(全卓並行) ---

  /** 全卓のハンドループを起動する(トーナメント開始時に一度だけ呼ぶ)。 */
  private startAllTables(): void {
    const mtt = this.mtt;
    if (!mtt || this.finished) return;
    if (mtt.isTournamentOver()) {
      void this.finishTournament();
      return;
    }
    for (const tableId of mtt.getTableIds()) this.pumpTable(tableId);
  }

  /**
   * 待機中(ハンド未進行かつ次ハンド未予約)の卓のうち、2人以上いる卓のループを起動する。
   * リバランスで人が移ってきた卓・新設された卓を拾うため、精算後や途中参加後に呼ぶ。
   */
  private reconcileTables(): void {
    const mtt = this.mtt;
    if (!mtt || this.finished) return;
    if (mtt.isTournamentOver()) {
      void this.finishTournament();
      return;
    }
    for (const tableId of mtt.getTableIds()) {
      const rt = this.runtime(tableId);
      if (rt.hand && !rt.hand.isHandComplete()) continue; // 進行中
      if (rt.pumpScheduled) continue; // 次ハンド予約済み
      if (mtt.getTableOccupancy(tableId).length < 2) continue; // リバランス待ち
      this.pumpTable(tableId);
    }
  }

  /** getTableIds に存在しなくなった(解体された)卓の進行状態を破棄する。 */
  private pruneRuntimes(): void {
    if (!this.mtt) return;
    const live = new Set(this.mtt.getTableIds());
    for (const [tid, rt] of [...this.runtimes]) {
      if (!live.has(tid)) {
        if (rt.turnTimer) clearTimeout(rt.turnTimer);
        this.runtimes.delete(tid);
      }
    }
  }

  /** 指定卓の次のハンドを開始し、その卓だけを進める(他卓は待たない)。 */
  private pumpTable(tableId: number, attempt = 0): void {
    const mtt = this.mtt;
    if (!mtt || this.finished) return;
    const rt = this.runtime(tableId);
    rt.pumpScheduled = false;
    if (mtt.isTournamentOver()) {
      void this.finishTournament();
      return;
    }
    if (!mtt.getTableIds().includes(tableId)) {
      // すでに解体された卓。進行状態を破棄して終了。
      if (rt.turnTimer) clearTimeout(rt.turnTimer);
      this.runtimes.delete(tableId);
      return;
    }
    if (rt.hand && !rt.hand.isHandComplete()) return; // 既に進行中
    if (mtt.getTableOccupancy(tableId).length < 2) return; // 2人未満はリバランス/ブレイク待ち

    // 万一startNextHandOnTableが失敗しても、その卓だけを再試行(最大5回・2秒間隔)する。
    try {
      rt.hand = mtt.startNextHandOnTable(tableId);
    } catch (err) {
      console.error(`[mtt] pumpTable failed on table ${tableId} (attempt ${attempt}):`, err);
      rt.hand = null;
      if (attempt < 5) {
        this.io.to(this.tableRoom(tableId)).emit("tableNotice", {
          kind: "retrying",
          message: "サーバー内部エラーのため、次のハンドの開始を再試行しています…",
        });
        rt.pumpScheduled = true;
        setTimeout(() => this.pumpTable(tableId, attempt + 1), 2000);
      } else {
        this.io.to(this.tableRoom(tableId)).emit("tableNotice", {
          kind: "stalled",
          message: "サーバー内部エラーで次のハンドを開始できませんでした。アプリを再読み込みして卓へ復帰してください。",
        });
      }
      return;
    }

    if (this.tableHasHuman(tableId)) {
      this.emitPlayersForTable(tableId);
      this.broadcastStateForTable(tableId);
      this.sendYourCardsForTable(tableId);
      this.scheduleTurn(rt);
    } else {
      this.driveInstantHand(rt);
    }
  }

  /** BOTのみ(または全員離脱済み)の卓のハンドを同期的に最後まで消化する。 */
  private driveInstantHand(rt: TableRuntime): void {
    const hand = rt.hand;
    if (!hand) return;
    let guard = 0;
    while (!hand.isHandComplete() && guard++ < 500) {
      const acting = hand.getActingSeatIndex();
      if (acting === null) break;
      const playerId = hand.getPublicState().seats.find((s) => s.seatIndex === acting)?.playerId;
      const human = playerId ? this.humans.get(playerId) : undefined;
      try {
        hand.applyAction(acting, human ? { kind: "fold" } : this.computeBotAction(rt, acting));
      } catch {
        hand.applyAction(acting, { kind: "fold" });
      }
    }
    void this.finishHand(rt);
  }

  private handleAction(rt: TableRuntime, seatIndex: number, action: PlayerAction): void {
    const hand = rt.hand;
    if (!hand || hand.isHandComplete()) return;
    if (hand.getActingSeatIndex() !== seatIndex) return;
    const tableId = rt.tableId;
    const playerId = hand.getPublicState().seats.find((s) => s.seatIndex === seatIndex)?.playerId;
    const human = playerId ? this.humans.get(playerId) : undefined;
    const preState = hand.getPublicState();
    const boardLenBefore = preState.board.length;
    let effectiveAction = action;
    try {
      hand.applyAction(seatIndex, action);
    } catch (err) {
      if (!human || human.left) {
        hand.applyAction(seatIndex, { kind: "fold" });
        effectiveAction = { kind: "fold" };
      } else {
        human.socket?.emit("actionError", { message: (err as Error).message });
        return;
      }
    }
    const tableHasHuman = this.tableHasHuman(tableId);
    // ストリートを閉じるアクションもアイコンに一瞬表示されるよう、状態更新と別に seatAction を発火する。
    if (tableHasHuman) {
      this.io.to(this.tableRoom(tableId)).emit("seatAction", buildSeatAction(seatIndex, effectiveAction, preState));
    }
    if (hand.isHandComplete()) {
      const boardGrew = hand.getPublicState().board.length > boardLenBefore;
      // ボードが自動展開された=オールインでベッティングが閉じたケース。ルール上の順序どおり
      // 「先にショウダウン→ストリートごとにボード公開→結果処理」で配信する(人間がいる卓のみ)。
      if (boardGrew && tableHasHuman) {
        const room = this.tableRoom(tableId);
        scheduleStagedRunout({
          hand,
          boardLenBefore,
          emitState: (state) => this.io.to(room).emit("state", state),
          emitShowdown: (holeCards) => this.io.to(room).emit("showdownReveal", { holeCards }),
          isStillCurrent: () => rt.hand === hand && !this.finished,
          onDone: () => void this.finishHand(rt),
        });
      } else {
        if (tableHasHuman) this.broadcastStateForTable(tableId);
        void this.finishHand(rt);
      }
    } else {
      if (tableHasHuman) this.broadcastStateForTable(tableId);
      this.scheduleTurn(rt);
    }
  }

  private scheduleTurn(rt: TableRuntime): void {
    if (rt.turnTimer) {
      clearTimeout(rt.turnTimer);
      rt.turnTimer = null;
    }
    const hand = rt.hand;
    if (!hand || hand.isHandComplete()) return;
    const actingSeat = hand.getActingSeatIndex();
    if (actingSeat === null) return;
    const playerId = hand.getPublicState().seats.find((s) => s.seatIndex === actingSeat)?.playerId;
    const human = playerId ? this.humans.get(playerId) : undefined;

    if (!human) {
      // 実際に選ぶアクションを先に確定し、人間と同じ20秒のショットクロックの中で動かす。
      const botAction = this.computeBotAction(rt, actingSeat);
      this.scheduleBotTurn(rt, actingSeat, botAction);
      return;
    }

    if (human.left) {
      rt.turnTimer = setTimeout(() => {
        if (!rt.hand || rt.hand.isHandComplete() || rt.hand.getActingSeatIndex() !== actingSeat) return;
        this.handleAction(rt, actingSeat, { kind: "fold" });
      }, FAST_DELAY_MS);
      return;
    }

    this.armHumanClock(rt, actingSeat, human, ACTION_CLOCK_MS);
  }

  /**
   * 自動プレイヤーの手番。人間と同じ20秒のショットクロックを表示し、その中の決めた時刻でアクション
   * する(早め〜ギリギリ)。20秒で決めきれない場合はタイムバンクで延長する。人間不在卓は即消化。
   */
  private scheduleBotTurn(rt: TableRuntime, actingSeat: number, botAction: PlayerAction): void {
    const room = this.tableRoom(rt.tableId);
    const act = () => {
      if (!rt.hand || rt.hand.isHandComplete() || rt.hand.getActingSeatIndex() !== actingSeat) return;
      this.handleAction(rt, actingSeat, botAction);
    };
    if (!this.tableHasHuman(rt.tableId)) {
      rt.turnTimer = setTimeout(act, FAST_DELAY_MS);
      return;
    }
    const street = rt.hand?.getPublicState().street ?? "preflop";
    const decision = botDecisionMs(street, botAction);
    this.io.to(room).emit("turnTimer", { seatIndex: actingSeat, endsAt: Date.now() + ACTION_CLOCK_MS, durationMs: ACTION_CLOCK_MS });
    if (decision <= ACTION_CLOCK_MS) {
      rt.turnTimer = setTimeout(act, decision);
      return;
    }
    // 20秒で決めきれず、タイムバンクを使って延長する。
    rt.turnTimer = setTimeout(() => {
      if (!rt.hand || rt.hand.isHandComplete() || rt.hand.getActingSeatIndex() !== actingSeat) return;
      this.io.to(room).emit("turnTimer", { seatIndex: actingSeat, endsAt: Date.now() + TIME_BANK_EXTENSION_MS, durationMs: TIME_BANK_EXTENSION_MS });
      rt.turnTimer = setTimeout(act, Math.min(decision - ACTION_CLOCK_MS, TIME_BANK_EXTENSION_MS - 1000));
    }, ACTION_CLOCK_MS);
  }

  private armHumanClock(rt: TableRuntime, actingSeat: number, human: HumanEntry, durationMs: number): void {
    const endsAt = Date.now() + durationMs;
    this.io.to(this.tableRoom(rt.tableId)).emit("turnTimer", { seatIndex: actingSeat, endsAt, durationMs });
    rt.turnTimer = setTimeout(() => {
      const current = rt.hand;
      if (!current || current.isHandComplete() || current.getActingSeatIndex() !== actingSeat) return;

      if (human.timeBankArmed && human.timeBankCards > 0 && !human.left) {
        human.timeBankCards -= 1;
        human.socket?.emit("timeBank", { cards: human.timeBankCards, armed: human.timeBankArmed, consumed: true });
        this.armHumanClock(rt, actingSeat, human, TIME_BANK_EXTENSION_MS);
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
      this.handleAction(rt, actingSeat, toCall <= 0 ? { kind: "check" } : { kind: "fold" });
    }, durationMs);
  }

  private computeBotAction(rt: TableRuntime, seatIndex: number): PlayerAction {
    const hand = rt.hand!;
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
      isAggressor: lastAggressorSeat(hand.getEvents()) === seatIndex,
    });
  }

  private async finishHand(rt: TableRuntime): Promise<void> {
    const mtt = this.mtt;
    const hand = rt.hand;
    const tableId = rt.tableId;
    if (!mtt || !hand || !this.dbTournamentId) return;

    const tableHadHuman = this.tableHasHuman(tableId);
    // このテーブルのハンドは完了扱いにする(busy集合から外れ、他卓の精算がこの卓を動かせるようになる)。
    rt.hand = null;
    if (rt.turnTimer) {
      clearTimeout(rt.turnTimer);
      rt.turnTimer = null;
    }

    // このメソッドの途中で何が失敗しても、末尾の「次ハンドの再スケジュール」には必ず到達させる
    // (ここが飛ぶと、ショウダウン直後にその卓が永久に固まる)。
    try {
      await this.finishHandInner(mtt, hand, tableId, tableHadHuman);
    } catch (err) {
      console.error("[mtt] finishHand failed (proceeding):", err);
      // 清算前に失敗した可能性に備えて一度だけ清算を試みる(排他区間で)。
      await this.runExclusive(() => {
        try {
          mtt.settleFinishedHandOnTable(tableId, hand, this.busyTableIds(tableId));
        } catch {
          /* 清算済みなら無視 */
        }
      });
    }

    this.syncHumanTables();
    this.pruneRuntimes();

    if (mtt.isTournamentOver()) {
      void this.finishTournament();
      return;
    }

    const anyoneActive = [...this.humans.values()].some((h) => !h.left && !h.done);
    if (!anyoneActive) {
      this.acceleratedHands += 1;
      if (this.acceleratedHands % 10 === 0) mtt.advanceToNextLevel();
    }

    // この卓の次ハンドを予約しつつ、リバランスで人が入った他の待機卓も起動する。
    const delay = tableHadHuman && anyoneActive ? NEXT_HAND_DELAY_MS : FAST_DELAY_MS;
    if (this.mtt?.getTableIds().includes(tableId)) {
      rt.pumpScheduled = true;
      setTimeout(() => this.pumpTable(tableId), delay);
    }
    this.reconcileTables();
  }

  private async finishHandInner(
    mtt: MultiTableTournament,
    hand: HandEngine,
    tableId: number,
    tableHadHuman: boolean,
  ): Promise<void> {
    const dbTournamentId = this.dbTournamentId;
    if (!dbTournamentId) return;
    // この卓の直近の handStarted を拾う(並行進行では他卓のイベントが後に積まれているため tableId で絞る)。
    const started = [...mtt.getEvents()].reverse().find((e) => e.type === "handStarted" && e.tableId === tableId);

    if (started && started.type === "handStarted") {
      const occupancy = mtt.getTableOccupancy(tableId);
      await recordHand({
        tournamentId: dbTournamentId,
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

    // --- エンジンの座席変更(精算・テーブルバランス・強制敗退)は排他区間で直列化する。
    // 進行中の他卓は動かさないよう busyTableIds(自卓は既に完了なので除外)を渡す。
    const critical = await this.runExclusive(() => {
      mtt.settleFinishedHandOnTable(tableId, hand, this.busyTableIds(tableId));
      const settled = [...mtt.getEvents()].reverse().find((e) => e.type === "handFinished" && e.tableId === tableId);
      const bustedPlayerIds = settled && settled.type === "handFinished" ? [...settled.bustedPlayerIds] : [];
      this.bustedOrder.push(...bustedPlayerIds);

      // このハンド中に離脱した人間を、通常のバスト判定を待たずここで確実に敗退確定する。
      const forced: string[] = [];
      for (const playerId of [...this.pendingForcedEliminations]) {
        const human = this.humans.get(playerId);
        if (!human || human.currentTableId !== tableId) continue;
        this.pendingForcedEliminations.delete(playerId);
        if (human.done) continue;
        mtt.forceEliminate(playerId, this.busyTableIds(tableId));
        if (!this.bustedOrder.includes(playerId)) this.bustedOrder.push(playerId);
        forced.push(playerId);
      }

      let bustedBots = 0;
      for (const playerId of bustedPlayerIds) {
        if (!this.humans.get(playerId)) bustedBots += 1; // 人間でない=ボットのバスト
      }
      return { bustedPlayerIds, forced, bustedBots };
    });

    // バストした人間(通常バスト＋強制敗退)の結果確定は排他区間の外で(DB書き込み・通知)。
    for (const playerId of [...critical.bustedPlayerIds, ...critical.forced]) {
      const human = this.humans.get(playerId);
      if (human && !human.done) {
        await this.recordHumanFinish(human).catch((err) => console.error("[mtt] recordHumanFinish failed:", err));
      }
    }

    // レジ中はボットもリエントリして場を維持する(上限内で、飛んだボット数ぶん新規ボットを足す)。
    if (critical.bustedBots > 0 && !this.registrationClosed && !this.finished) {
      const room = MTT_FIELD_CAP - this.aliveCount();
      const add = Math.min(critical.bustedBots, Math.max(0, room));
      if (add > 0) {
        const bots = await this.freshBots(add).catch(() => []);
        if (bots.length > 0) {
          await this.runExclusive(() => {
            for (const b of bots) this.addLateBot(b);
          });
        }
      }
    }
  }

  /** レジクロ(登録締切)。以降は新規登録・レイトレジ・リエントリを受け付けず、確定エントリー数でプライズを固定する。 */
  closeRegistration(): void {
    if (this.registrationClosed) return;
    this.registrationClosed = true;
    this.prizeStructure = computeMttPrizeStructure(Math.max(this.entryCount, 1), this.buyIn).places;
    if (this.regCloseTimer) {
      clearTimeout(this.regCloseTimer);
      this.regCloseTimer = null;
    }
    if (this.topupTimer) {
      clearInterval(this.topupTimer);
      this.topupTimer = null;
    }
    if (this.matchTimer) {
      clearTimeout(this.matchTimer);
      this.matchTimer = null;
    }
    // 確定したペイアウトストラクチャを全卓へ通知(RCした瞬間に「何位いくら」が見えるようになる)。
    if (this.mtt) {
      const total = this.prizeStructure.reduce((s, p) => s + p.amount, 0);
      this.io
        .to([...this.mtt.getTableIds()].map((id) => this.tableRoom(id)))
        .emit("registrationClosed", { places: this.prizeStructure, prizePool: total });
    }
    this.broadcastTournamentInfo();
    // スケジューラへ通知: 募集先を次の新しいMTTへ切り替える(このMTTは裏で優勝者まで進行)。
    this.onRegistrationClosed?.();
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

    // DB書き込みが失敗しても、本人への結果通知とゲーム進行は止めない。
    try {
      await prisma.tournamentEntry.updateMany({
        where: { tournamentId: this.dbTournamentId, userId: human.userId },
        data: { finishPosition: place, payout },
      });
      if (payout > 0) {
        await recordPayout({ userId: human.userId, tournamentId: this.dbTournamentId, amount: payout });
      }
    } catch (err) {
      console.error("[mtt] recordHumanFinish db write failed:", err);
    }

    human.socket?.emit("tournamentOver", {
      winnerPlayerId: place === 1 ? human.userId : null,
      yourFinishPosition: place,
      yourPayout: payout,
      // レジクローズ前かつ場が満員でなければリエントリ可能(クライアントがボタン表示に使う)。
      canReEntry: !this.registrationClosed && !this.finished && this.aliveCount() < MTT_FIELD_CAP,
      reEntryCost: this.buyIn,
    });
    // 離席/切断中に終了した場合に備えて結果を保存(復帰時に結果サジェスト表示)。
    activeGames.recordResult(human.userId, {
      winnerPlayerId: place === 1 ? human.userId : null,
      yourFinishPosition: place,
      yourPayout: payout,
      gameKey: "mtt",
    });
  }

  private async finishTournament(): Promise<void> {
    const mtt = this.mtt;
    if (!mtt || !this.dbTournamentId || this.finished) return;
    this.finished = true;
    for (const rt of this.runtimes.values()) {
      if (rt.turnTimer) clearTimeout(rt.turnTimer);
      rt.turnTimer = null;
    }
    if (this.matchTimer) clearTimeout(this.matchTimer);
    if (this.regCloseTimer) clearTimeout(this.regCloseTimer);
    if (this.topupTimer) clearInterval(this.topupTimer);
    this.matchTimer = null;
    this.regCloseTimer = null;
    this.topupTimer = null;
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
    // MTTは1レベル3分(値はSNGと同一、時間だけ短縮)。表示上のdurationMinutesも3に揃える。
    const raw = mtt.getCurrentLevel();
    const level = { ...raw, durationMinutes: MTT_LEVEL_DURATION_MS / 60_000 };
    this.levelEndsAt = Date.now() + MTT_LEVEL_DURATION_MS;
    this.io.to([...this.mtt!.getTableIds()].map((id) => this.tableRoom(id))).emit("levelUp", { level, endsAt: this.levelEndsAt });
    setTimeout(() => {
      if (!this.mtt || this.mtt.isTournamentOver() || this.finished) return;
      this.mtt.advanceToNextLevel();
      this.scheduleLevelAdvance();
    }, MTT_LEVEL_DURATION_MS);
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

  /** トーナメントクロック画面用の集計情報(残り人数/総数/アベレージスタック/プライズ)を全卓に配信。 */
  private broadcastTournamentInfo(): void {
    const mtt = this.mtt;
    if (!mtt) return;
    let remaining = 0;
    let totalChips = 0;
    // 生存者のスタックを集めてBB持ち降順のライブ順位を作る(右メニューのランキング用)。
    const bb = Math.max(1, mtt.getCurrentLevel().bigBlind);
    const alive: { userId: string; stack: number }[] = [];
    for (const tid of mtt.getTableIds()) {
      for (const o of mtt.getTableOccupancy(tid)) {
        remaining += 1;
        totalChips += o.stack;
        alive.push({ userId: o.playerId, stack: o.stack });
      }
    }
    alive.sort((a, b) => b.stack - a.stack);
    const standings = alive.map((a, i) => {
      const info = this.playersById.get(a.userId);
      return {
        userId: a.userId,
        displayName: info?.displayName ?? a.userId,
        stack: a.stack,
        bbStack: Math.round((a.stack / bb) * 10) / 10,
        rank: i + 1,
        isBot: info?.isBot ?? true,
      };
    });
    const averageStack = remaining > 0 ? Math.round(totalChips / remaining) : 0;
    // RC前は「何位いくら」を出さず、プライズプール総額のみ見せる。RC後は確定ペイアウト(places)を出す。
    const structure = computeMttPrizeStructure(Math.max(this.entryCount, 1), this.buyIn);
    const prizePool = this.registrationClosed ? this.prizeStructure : [];
    const isFinalTable = remaining > 1 && remaining <= MTT_TABLE_SEAT_COUNT;
    this.io.to([...mtt.getTableIds()].map((id) => this.tableRoom(id))).emit("tournamentInfo", {
      remaining,
      total: this.entryCount,
      averageStack,
      prizePool,
      prizePoolTotal: structure.prizePool,
      registrationClosed: this.registrationClosed,
      registrationClosesAt: this.registrationClosed ? null : this.registrationClosesAt || null,
      isFinalTable,
      standings,
      tournamentId: this.dbTournamentId ?? null,
    });
  }

  private broadcastStateForTable(tableId: number): void {
    const rt = this.runtimes.get(tableId);
    if (!rt?.hand) return;
    this.broadcastTournamentInfo();
    this.io.to(this.tableRoom(tableId)).emit("state", rt.hand.getPublicState());
  }

  private sendYourCardsForTable(tableId: number): void {
    const rt = this.runtimes.get(tableId);
    if (!rt?.hand) return;
    for (const human of this.humans.values()) {
      if (human.currentTableId !== tableId || !human.socket) continue;
      const seatIndex = this.seatIndexOf(human.userId);
      if (seatIndex === null) continue;
      // リエントリ時の「元席」希望に使うため、直近の着席位置を記録しておく。
      this.lastSeatByUser.set(human.userId, { tableId, seatIndex });
      human.socket.emit("yourCards", { seatIndex, cards: rt.hand.getSeatHoleCards(seatIndex).map(cardToString) });
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
