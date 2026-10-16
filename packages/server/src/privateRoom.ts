import { randomInt } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { TableSession, SNG_SEAT_COUNT, type GameSession, type HumanPlayer, type PrivateStanding } from "./gameServer.js";

/**
 * フレンド対戦(ルームのホストが設定を決め、6桁のコードで友達を呼んで遊ぶ卓)。
 *
 * - ルームはこのサーバーのメモリにだけある(他の卓と同じ。再起動すると消える)。
 * - 成績(収支・偏差値・ランキング・スタッツ・GEO の解放条件)には数えない。ハンドは GEO のデータベースに入る。
 * - 席とボタンはスタート時に暗号学的な乱数で決める(`TableSession` の private モード)。
 * - 空席を自動で埋めるかどうか・何席埋めるかはホストが決める。埋めた席も人間と同じ形で扱い、
 *   通信にも画面にも種別の印を一切出さない(CLAUDE.md の最優先ルール)。
 */

export type BlindSpeed = "turbo" | "normal" | "deep";

/** ブラインドの3択(オーナー確定)。ブラインドの表は SNG と同じで、1レベルの時間と開始スタックだけ違う。 */
export const BLIND_PRESETS: Record<BlindSpeed, { levelDurationMs: number; startingStack: number }> = {
  turbo: { levelDurationMs: 3 * 60_000, startingStack: 20_000 },
  normal: { levelDurationMs: 5 * 60_000, startingStack: 20_000 },
  deep: { levelDurationMs: 10 * 60_000, startingStack: 40_000 },
};

export interface PrivateRoomSettings {
  /** 最大人数(2〜6)。 */
  readonly maxPlayers: number;
  readonly blind: BlindSpeed;
  /** レイトイン(途中参加)。 */
  readonly lateEntry: boolean;
  /** レイトインはこのレベルの終わりまで(1〜10)。 */
  readonly lateEntryUntilLevel: number;
  readonly reentry: boolean;
  /** リエントリーの回数(1〜5)。null は無制限。 */
  readonly reentryLimit: number | null;
  /** 空席を自動で埋める席の数(0 なら埋めない)。最大人数から集まった人数を引いた分までしか埋めない。 */
  readonly autoSeats: number;
  readonly chat: boolean;
  readonly timeBank: boolean;
}

export const DEFAULT_PRIVATE_SETTINGS: PrivateRoomSettings = {
  maxPlayers: 6,
  blind: "normal",
  lateEntry: true,
  lateEntryUntilLevel: 6,
  reentry: true,
  reentryLimit: 1,
  autoSeats: 0,
  chat: true,
  timeBank: true,
};

function intIn(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 画面から届いた設定を、決められた範囲に収めて返す(届かなかった項目は `base` のまま)。 */
export function normalizePrivateSettings(raw: unknown, base: PrivateRoomSettings = DEFAULT_PRIVATE_SETTINGS): PrivateRoomSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const maxPlayers = intIn(r["maxPlayers"], 2, SNG_SEAT_COUNT, base.maxPlayers);
  const blind: BlindSpeed = r["blind"] === "turbo" || r["blind"] === "normal" || r["blind"] === "deep" ? r["blind"] : base.blind;
  const bool = (k: keyof PrivateRoomSettings, fallback: boolean) => (typeof r[k] === "boolean" ? (r[k] as boolean) : fallback);
  const reentryLimit =
    r["reentryLimit"] === null ? null : r["reentryLimit"] === undefined ? base.reentryLimit : intIn(r["reentryLimit"], 1, 5, base.reentryLimit ?? 1);
  return {
    maxPlayers,
    blind,
    lateEntry: bool("lateEntry", base.lateEntry),
    lateEntryUntilLevel: intIn(r["lateEntryUntilLevel"], 1, 10, base.lateEntryUntilLevel),
    reentry: bool("reentry", base.reentry),
    reentryLimit,
    autoSeats: intIn(r["autoSeats"], 0, maxPlayers - 1, Math.min(base.autoSeats, maxPlayers - 1)),
    chat: bool("chat", base.chat),
    timeBank: bool("timeBank", base.timeBank),
  };
}

/** 6桁の数字のコード。今開いているルームとは重ならないものを選ぶ。 */
export function generateRoomCode(taken: (code: string) => boolean, random: (max: number) => number = (max) => randomInt(0, max)): string {
  for (let i = 0; i < 1000; i++) {
    const code = String(random(1_000_000)).padStart(6, "0");
    if (!taken(code)) return code;
  }
  throw new Error("Could not allocate a room code");
}

/** スタート前に放置されたルームを消すまでの時間(オーナー確定: 作ってから30分)。 */
export const ROOM_IDLE_TTL_MS = 30 * 60_000;
/** 待合で通信が切れた人の席とホストを保つ時間。過ぎたら抜けた扱いにする。 */
export const LOBBY_DISCONNECT_GRACE_MS = 60_000;
/** コードの総当たりを防ぐ: 1つの接続で、間違ったコードを入れられる回数(1分あたり)。 */
const JOIN_FAILURES_PER_MINUTE = 10;

export type RoomPhase = "lobby" | "playing" | "finished";

interface Member extends HumanPlayer {
  socket: Socket | null;
  joinedAt: number;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

interface Room {
  readonly code: string;
  hostUserId: string;
  settings: PrivateRoomSettings;
  members: Map<string, Member>;
  phase: RoomPhase;
  session: TableSession | null;
  standings: PrivateStanding[] | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

export interface PrivateRoomPayload {
  code: string;
  hostUserId: string;
  isHost: boolean;
  phase: RoomPhase;
  settings: PrivateRoomSettings;
  members: { userId: string; displayName: string; avatarKey: string | null }[];
  standings: PrivateStanding[] | null;
}

export type ResolveUser = (socket: Socket) => Promise<HumanPlayer | null>;

export interface PrivateRoomHooks {
  /** ゲームが始まったとき(ロビーが再接続の戻り先として覚える)。 */
  onSessionStarted: (session: GameSession, userIds: string[]) => void;
  /** この人が SNG / MTT を遊んでいる最中なら true(ルームには入れない)。 */
  isBusyElsewhere: (userId: string) => boolean;
}

/** 失敗を画面へ返すときの理由。 */
type ErrorCode =
  | "AUTH"
  | "NOT_FOUND"
  | "FULL"
  | "STARTED"
  | "NOT_HOST"
  | "NOT_ENOUGH"
  | "BUSY"
  | "TOO_MANY_TRIES"
  | "NOT_IN_ROOM";

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  AUTH: "ログインまたはプロフィール設定が完了していません",
  NOT_FOUND: "このコードのルームは見つかりません",
  FULL: "このルームは満員です",
  STARTED: "このルームはすでに始まっています",
  NOT_HOST: "ホストだけが操作できます",
  NOT_ENOUGH: "2人以上そろうとスタートできます",
  BUSY: "対局中のゲームがあります",
  TOO_MANY_TRIES: "しばらく待ってからもう一度入力してください",
  NOT_IN_ROOM: "ルームに入っていません",
};

type Ack = (res: { ok: true; code?: string } | { ok: false; error: ErrorCode; message: string }) => void;

export class PrivateRoomManager {
  private readonly rooms = new Map<string, Room>();
  /** userId → 入っているルームのコード(1人1ルーム)。 */
  private readonly roomOfUser = new Map<string, string>();
  /** userId → 間違ったコードを入れた時刻(直近1分)。接続をつなぎ直しても数え直しにならないよう人ごとに持つ。 */
  private readonly joinFailures = new Map<string, number[]>();

  constructor(
    private readonly io: Server,
    private readonly resolveUser: ResolveUser,
    private readonly hooks: PrivateRoomHooks,
  ) {}

  /**
   * SNG / MTT に参加するときに呼ぶ。待合か終了後のルームにいれば抜ける(ゲーム中のルームからは抜けない。
   * その人はそもそも卓へ戻される)。
   */
  releaseFromLobby(userId: string): void {
    const room = this.roomFor(userId);
    if (room && room.phase !== "playing") this.leaveCurrentRoom(userId);
  }

  /** いま開いているルームの数(診断用)。 */
  roomCount(): number {
    return this.rooms.size;
  }

  handleConnection(socket: Socket): void {
    const wrap =
      <T>(fn: (socket: Socket, payload: T, ack: Ack) => Promise<void> | void) =>
      (payload: T, ack?: unknown) => {
        const reply: Ack = typeof ack === "function" ? (ack as Ack) : () => {};
        Promise.resolve(fn.call(this, socket, payload ?? ({} as T), reply)).catch((err) => {
          console.error("[private] handler failed:", err);
        });
      };
    socket.on("privateCreate", wrap<{ settings?: unknown }>(this.onCreate));
    socket.on("privateJoin", wrap<{ code?: unknown }>(this.onJoin));
    socket.on("privateResume", wrap<Record<string, never>>(this.onResume));
    socket.on("privateLeave", wrap<Record<string, never>>(this.onLeave));
    socket.on("privateKick", wrap<{ userId?: unknown }>(this.onKick));
    socket.on("privateSettings", wrap<{ settings?: unknown }>(this.onSettings));
    socket.on("privateStart", wrap<Record<string, never>>(this.onStart));
    socket.on("privateRematch", wrap<Record<string, never>>(this.onRematch));
    socket.on("privateDisband", wrap<Record<string, never>>(this.onDisband));
    socket.on("disconnect", () => this.onDisconnect(socket));
  }

  // ---- 入口 ------------------------------------------------------------------------------------

  private async identify(socket: Socket, ack: Ack): Promise<HumanPlayer | null> {
    const player = await this.resolveUser(socket);
    if (!player) {
      this.fail(ack, "AUTH");
      return null;
    }
    socket.data["userId"] = player.userId;
    return player;
  }

  private async onCreate(socket: Socket, payload: { settings?: unknown }, ack: Ack): Promise<void> {
    const player = await this.identify(socket, ack);
    if (!player) return;
    if (this.hooks.isBusyElsewhere(player.userId)) return this.fail(ack, "BUSY");
    this.leaveCurrentRoom(player.userId);

    const code = generateRoomCode((c) => this.rooms.has(c));
    const room: Room = {
      code,
      hostUserId: player.userId,
      settings: normalizePrivateSettings(payload.settings),
      members: new Map(),
      phase: "lobby",
      session: null,
      standings: null,
      idleTimer: null,
    };
    this.rooms.set(code, room);
    this.armIdleTimer(room);
    this.addMember(room, player, socket);
    ack({ ok: true, code });
    this.broadcast(room);
  }

  private async onJoin(socket: Socket, payload: { code?: unknown }, ack: Ack): Promise<void> {
    const player = await this.identify(socket, ack);
    if (!player) return;
    if (this.tooManyFailures(player.userId)) return this.fail(ack, "TOO_MANY_TRIES");
    const code = typeof payload.code === "string" ? payload.code.replace(/\D/g, "") : "";
    const room = this.rooms.get(code);
    if (!room) {
      this.recordFailure(player.userId);
      return this.fail(ack, "NOT_FOUND");
    }
    // すでにこのルームにいる(再接続・二重タップ)なら、そのまま戻す。
    if (room.members.has(player.userId)) {
      this.attachSocket(room, player.userId, socket);
      ack({ ok: true, code });
      this.broadcast(room);
      return;
    }
    if (this.hooks.isBusyElsewhere(player.userId)) return this.fail(ack, "BUSY");
    // 始まった後の参加(レイトイン・観戦)は次の段階で足す。今は待合のルームにだけ入れる。
    if (room.phase === "playing") return this.fail(ack, "STARTED");
    if (room.members.size >= room.settings.maxPlayers) return this.fail(ack, "FULL");

    this.leaveCurrentRoom(player.userId);
    this.addMember(room, player, socket);
    ack({ ok: true, code });
    this.broadcast(room);
  }

  /** アプリの再読み込み・回線の復帰。入っているルームがあれば今の状態を送り直す。 */
  private async onResume(socket: Socket, _payload: Record<string, never>, ack: Ack): Promise<void> {
    const player = await this.identify(socket, ack);
    if (!player) return;
    const room = this.roomFor(player.userId);
    if (!room) return this.fail(ack, "NOT_IN_ROOM");
    this.attachSocket(room, player.userId, socket);
    ack({ ok: true, code: room.code });
    this.broadcast(room);
  }

  private onLeave(socket: Socket, _payload: Record<string, never>, ack: Ack): void {
    const userId = socket.data["userId"] as string | undefined;
    if (!userId || !this.roomFor(userId)) return this.fail(ack, "NOT_IN_ROOM");
    this.leaveCurrentRoom(userId);
    ack({ ok: true });
  }

  private onKick(socket: Socket, payload: { userId?: unknown }, ack: Ack): void {
    const room = this.hostRoom(socket, ack);
    if (!room) return;
    if (room.phase === "playing") return this.fail(ack, "STARTED");
    const target = typeof payload.userId === "string" ? payload.userId : "";
    if (!room.members.has(target) || target === room.hostUserId) return this.fail(ack, "NOT_IN_ROOM");
    const member = room.members.get(target)!;
    this.removeMember(room, target);
    member.socket?.emit("privateRoomClosed", { code: room.code, reason: "KICKED" });
    ack({ ok: true });
    this.broadcast(room);
  }

  private onSettings(socket: Socket, payload: { settings?: unknown }, ack: Ack): void {
    const room = this.hostRoom(socket, ack);
    if (!room) return;
    if (room.phase === "playing") return this.fail(ack, "STARTED");
    room.settings = normalizePrivateSettings(payload.settings, room.settings);
    ack({ ok: true });
    this.broadcast(room);
  }

  private async onStart(socket: Socket, _payload: Record<string, never>, ack: Ack): Promise<void> {
    const room = this.hostRoom(socket, ack);
    if (!room) return;
    if (room.phase === "playing") return this.fail(ack, "STARTED");
    // 最大人数を超えて入っている(待合で人数を減らした)ときは、入った順に最大人数まで。
    const seated = [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt).slice(0, room.settings.maxPlayers);
    if (seated.length < 2) return this.fail(ack, "NOT_ENOUGH");

    const preset = BLIND_PRESETS[room.settings.blind];
    const session = new TableSession({
      io: this.io,
      seatCount: SNG_SEAT_COUNT,
      humans: seated.map((m) => ({ userId: m.userId, displayName: m.displayName, avatarKey: m.avatarKey })),
      private: {
        roomCode: room.code,
        startingStack: preset.startingStack,
        levelDurationMs: preset.levelDurationMs,
        chat: room.settings.chat,
        timeBank: room.settings.timeBank,
        autoSeats: Math.max(0, Math.min(room.settings.autoSeats, room.settings.maxPlayers - seated.length)),
        onFinished: (standings) => this.onGameFinished(room, session, standings),
      },
    });
    room.session = session;
    room.phase = "playing";
    room.standings = null;
    this.clearIdleTimer(room);
    const userIds = seated.map((m) => m.userId);
    this.hooks.onSessionStarted(session, userIds);
    ack({ ok: true, code: room.code });
    this.broadcast(room);
    for (const m of seated) if (m.socket) session.attachHuman(m.socket, m.userId);
    try {
      await session.start();
    } catch (err) {
      console.error("[private] failed to start:", err);
      room.phase = "lobby";
      room.session = null;
      this.armIdleTimer(room);
      this.broadcast(room);
    }
  }

  /** ホストが「もう一度」: 同じコード・同じ設定の待合に戻る(参加者はそのまま残り、抜けたい人は抜ける)。 */
  private onRematch(socket: Socket, _payload: Record<string, never>, ack: Ack): void {
    const room = this.hostRoom(socket, ack);
    if (!room) return;
    if (room.phase !== "finished") return this.fail(ack, "STARTED");
    room.phase = "lobby";
    room.session = null;
    room.standings = null;
    this.armIdleTimer(room);
    ack({ ok: true, code: room.code });
    this.broadcast(room);
  }

  /** ホストが「解散」: 全員を外してルームを閉じる。ゲーム中はできない。 */
  private onDisband(socket: Socket, _payload: Record<string, never>, ack: Ack): void {
    const room = this.hostRoom(socket, ack);
    if (!room) return;
    if (room.phase === "playing") return this.fail(ack, "STARTED");
    ack({ ok: true });
    this.closeRoom(room, "DISBANDED");
  }

  private onDisconnect(socket: Socket): void {
    const userId = socket.data["userId"] as string | undefined;
    if (!userId) return;
    const room = this.roomFor(userId);
    const member = room?.members.get(userId);
    if (!room || !member || member.socket !== socket) return;
    member.socket = null;
    // ゲーム中の切断は卓(TableSession)が扱う(離席にして、戻れば復帰)。待合と終了後だけ猶予を置いて外す。
    if (room.phase === "playing") return;
    this.startGrace(room, userId);
  }

  // ---- ルームの中身 -------------------------------------------------------------------------------

  private onGameFinished(room: Room, session: TableSession, standings: PrivateStanding[]): void {
    if (room.session !== session || !this.rooms.has(room.code)) return;
    room.phase = "finished";
    room.standings = standings;
    // ゲームの間に抜けた(チップを放棄した)人や、通信が切れたままの人は、終わった時点でルームから外す
    // のではなく残す。ホストの「もう一度」で待合に戻ったあと、60秒の猶予で外れる。
    for (const m of room.members.values()) {
      if (!m.socket && !m.graceTimer) this.startGrace(room, m.userId);
    }
    this.armIdleTimer(room);
    this.broadcast(room);
  }

  /** 通信が切れた人を、60秒戻らなければルームから外す。 */
  private startGrace(room: Room, userId: string): void {
    const member = room.members.get(userId);
    if (!member) return;
    if (member.graceTimer) clearTimeout(member.graceTimer);
    member.graceTimer = setTimeout(() => {
      member.graceTimer = null;
      if (member.socket === null && this.roomFor(userId) === room && room.phase !== "playing") {
        this.removeMember(room, userId);
        this.broadcast(room);
      }
    }, LOBBY_DISCONNECT_GRACE_MS);
  }

  private addMember(room: Room, player: HumanPlayer, socket: Socket): void {
    room.members.set(player.userId, {
      userId: player.userId,
      displayName: player.displayName,
      avatarKey: player.avatarKey,
      socket,
      joinedAt: Date.now(),
      graceTimer: null,
    });
    this.roomOfUser.set(player.userId, room.code);
  }

  private attachSocket(room: Room, userId: string, socket: Socket): void {
    const member = room.members.get(userId);
    if (!member) return;
    member.socket = socket;
    if (member.graceTimer) {
      clearTimeout(member.graceTimer);
      member.graceTimer = null;
    }
    // ゲーム中なら卓へ戻す(手札・手番の時計も送り直される)。
    if (room.phase === "playing" && room.session && !room.session.isUserDone(userId)) {
      room.session.attachHuman(socket, userId);
    }
  }

  private removeMember(room: Room, userId: string): void {
    const member = room.members.get(userId);
    if (!member) return;
    if (member.graceTimer) clearTimeout(member.graceTimer);
    room.members.delete(userId);
    if (this.roomOfUser.get(userId) === room.code) this.roomOfUser.delete(userId);
    // ゲーム中に抜けるのはチップを放棄して抜けるのと同じ(卓の「退出」と同じ扱い)。
    if (room.phase === "playing") room.session?.leave(userId);
    if (room.members.size === 0) {
      // ゲーム中に全員抜けた卓は、残りを自動で畳んで終わる(TableSession が処理する)。ルームはここで消す。
      this.closeRoom(room, "EMPTY");
      return;
    }
    // ホストが抜けたら、残っている中で最初に入った人へ引き継ぐ(オーナー確定)。
    if (room.hostUserId === userId) {
      const next = [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0]!;
      room.hostUserId = next.userId;
    }
  }

  private leaveCurrentRoom(userId: string): void {
    const room = this.roomFor(userId);
    if (!room) return;
    const member = room.members.get(userId);
    this.removeMember(room, userId);
    member?.socket?.emit("privateRoomClosed", { code: room.code, reason: "LEFT" });
    if (this.rooms.has(room.code)) this.broadcast(room);
  }

  private closeRoom(room: Room, reason: "DISBANDED" | "EXPIRED" | "EMPTY"): void {
    this.clearIdleTimer(room);
    this.rooms.delete(room.code);
    for (const m of room.members.values()) {
      if (m.graceTimer) clearTimeout(m.graceTimer);
      if (this.roomOfUser.get(m.userId) === room.code) this.roomOfUser.delete(m.userId);
      m.socket?.emit("privateRoomClosed", { code: room.code, reason });
    }
    room.members.clear();
  }

  /** スタート前(と終わった後)に放置されたルームを、30分で消す。ゲーム中は止める。 */
  private armIdleTimer(room: Room): void {
    this.clearIdleTimer(room);
    room.idleTimer = setTimeout(() => {
      room.idleTimer = null;
      if (this.rooms.get(room.code) === room && room.phase !== "playing") this.closeRoom(room, "EXPIRED");
    }, ROOM_IDLE_TTL_MS);
    if (typeof room.idleTimer.unref === "function") room.idleTimer.unref();
  }

  private clearIdleTimer(room: Room): void {
    if (room.idleTimer) clearTimeout(room.idleTimer);
    room.idleTimer = null;
  }

  // ---- 補助 ------------------------------------------------------------------------------------

  private roomFor(userId: string): Room | null {
    const code = this.roomOfUser.get(userId);
    return code ? this.rooms.get(code) ?? null : null;
  }

  private hostRoom(socket: Socket, ack: Ack): Room | null {
    const userId = socket.data["userId"] as string | undefined;
    const room = userId ? this.roomFor(userId) : null;
    if (!room) {
      this.fail(ack, "NOT_IN_ROOM");
      return null;
    }
    if (room.hostUserId !== userId) {
      this.fail(ack, "NOT_HOST");
      return null;
    }
    return room;
  }

  private payloadFor(room: Room, userId: string): PrivateRoomPayload {
    return {
      code: room.code,
      hostUserId: room.hostUserId,
      isHost: room.hostUserId === userId,
      phase: room.phase,
      settings: room.settings,
      members: [...room.members.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((m) => ({ userId: m.userId, displayName: m.displayName, avatarKey: m.avatarKey })),
      standings: room.standings,
    };
  }

  private broadcast(room: Room): void {
    for (const m of room.members.values()) m.socket?.emit("privateRoom", this.payloadFor(room, m.userId));
  }

  private fail(ack: Ack, error: ErrorCode): void {
    ack({ ok: false, error, message: ERROR_MESSAGES[error] });
  }

  private tooManyFailures(userId: string): boolean {
    const now = Date.now();
    const recent = (this.joinFailures.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length === 0) this.joinFailures.delete(userId);
    else this.joinFailures.set(userId, recent);
    return recent.length >= JOIN_FAILURES_PER_MINUTE;
  }

  private recordFailure(userId: string): void {
    const list = this.joinFailures.get(userId) ?? [];
    list.push(Date.now());
    this.joinFailures.set(userId, list);
  }
}
