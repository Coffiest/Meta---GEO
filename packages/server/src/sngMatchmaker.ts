import type { Server, Socket } from "socket.io";
import { TableSession, SNG_SEAT_COUNT, type HumanPlayer, type GameSession } from "./gameServer.js";

/** 人間だけで揃うのを待つ時間。これを過ぎたら空き枠へBOTを1体ずつ入れ始める。 */
const BOT_FILL_START_MS = 10_000;
/** BOTが1体ずつ入る間隔(ランダム)。「1秒ごとにランダムなタイミング」を再現する。 */
const BOT_FILL_GAP_MIN_MS = 500;
const BOT_FILL_GAP_MAX_MS = 1500;
/** 6/6が表示されてから実際にゲームを開始するまでの余韻。 */
const START_AFTER_FULL_MS = 650;

interface QueuedPlayer extends HumanPlayer {
  socket: Socket;
}

/**
 * SNGのマッチング待合室。「ポーカーチェイス」のような「O/6人集まっています」表示のため、
 * まず人間プレイヤーを優先的に集める(6人揃えば即開始・全員人間)。10秒経っても揃わなければ、
 * 空いている枠へBOTを1体ずつ(0.5〜1.5秒間隔のランダムなタイミングで)入れていき、表示上の
 * O/6もBOTで増える。BOTを含めて6/6になった瞬間にゲームを開始する。
 * SNGは途中参加・リエントリー不可(卓成立後は締切)。
 */
export class SngMatchmaker {
  private queue: QueuedPlayer[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** BOT補填フェーズで表示上埋まったBOTの数(実際のBOT着席はstartBatchで行う)。 */
  private botFillCount = 0;
  private filling = false;
  private readonly io: Server;
  private readonly onSessionReady: (session: GameSession, humanUserIds: string[]) => void;

  constructor(io: Server, onSessionReady: (session: GameSession, humanUserIds: string[]) => void) {
    this.io = io;
    this.onSessionReady = onSessionReady;
  }

  isQueued(userId: string): boolean {
    return this.queue.some((p) => p.userId === userId);
  }

  /** 現在の表示上の登録人数(人間 + 補填済みBOT)。最大6。 */
  private displayedRegistered(): number {
    return Math.min(SNG_SEAT_COUNT, this.queue.length + this.botFillCount);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  join(player: HumanPlayer, socket: Socket): void {
    if (this.isQueued(player.userId)) {
      this.emitStatus(socket);
      return;
    }
    this.queue.push({ ...player, socket });
    socket.on("disconnect", () => this.leaveQueue(player.userId));

    // 最初の1人が来たら、10秒後にBOT補填を開始するタイマーを仕込む。
    if (this.queue.length === 1 && !this.filling) {
      this.timer = setTimeout(() => this.beginBotFill(), BOT_FILL_START_MS);
    }
    this.broadcastStatus();

    // 6人の人間が揃ったら即開始(全員人間・BOTなし)。
    if (this.displayedRegistered() >= SNG_SEAT_COUNT) {
      this.clearTimer();
      void this.startBatch();
    }
  }

  leaveQueue(userId: string): void {
    const before = this.queue.length;
    this.queue = this.queue.filter((p) => p.userId !== userId);
    if (this.queue.length === before) return;
    // 全員抜けたら補填フェーズも含めてリセットする。
    if (this.queue.length === 0) {
      this.clearTimer();
      this.filling = false;
      this.botFillCount = 0;
    }
    this.broadcastStatus();
  }

  /** 10秒経過: 空き枠へBOTを1体ずつ入れ始める。 */
  private beginBotFill(): void {
    this.timer = null;
    if (this.queue.length === 0) return;
    this.filling = true;
    this.botFillCount = 0;
    this.stepBotFill();
  }

  /** BOTを1体分、表示上の枠に入れる。6/6に達したら少し余韻を置いてゲーム開始。 */
  private stepBotFill(): void {
    this.timer = null;
    if (this.queue.length === 0) return;

    // 既に6人(人間のみ、または人間+BOT)埋まっていれば開始。
    if (this.displayedRegistered() >= SNG_SEAT_COUNT) {
      void this.startBatch();
      return;
    }

    // BOTを1体ぶん増やして全員に通知する。
    this.botFillCount += 1;
    this.broadcastStatus();

    if (this.displayedRegistered() >= SNG_SEAT_COUNT) {
      // 6/6になった瞬間を見せてから開始する。
      this.timer = setTimeout(() => void this.startBatch(), START_AFTER_FULL_MS);
    } else {
      const gap = BOT_FILL_GAP_MIN_MS + Math.random() * (BOT_FILL_GAP_MAX_MS - BOT_FILL_GAP_MIN_MS);
      this.timer = setTimeout(() => this.stepBotFill(), gap);
    }
  }

  private emitStatus(socket: Socket): void {
    // 補填フェーズ中は残り秒数(secondsLeft)は出さない(BOTで埋まっていくため)。
    const secondsLeft = this.filling
      ? null
      : Math.max(0, Math.ceil(BOT_FILL_START_MS / 1000));
    socket.emit("sngMatching", { registered: this.displayedRegistered(), needed: SNG_SEAT_COUNT, secondsLeft });
  }

  private broadcastStatus(): void {
    for (const p of this.queue) this.emitStatus(p.socket);
  }

  private async startBatch(): Promise<void> {
    this.clearTimer();
    if (this.queue.length === 0) return;
    const humans = this.queue.splice(0, SNG_SEAT_COUNT);
    const leftoverHumans = this.queue.length > 0;
    this.filling = false;
    this.botFillCount = 0;

    for (const h of humans) h.socket.emit("sngMatching", { registered: SNG_SEAT_COUNT, needed: SNG_SEAT_COUNT, secondsLeft: 0, starting: true });

    // 7人以上が同時に並んでいた場合、あふれた人間は取り残さず次の卓のマッチングを即開始する。
    if (leftoverHumans) {
      this.timer = setTimeout(() => this.beginBotFill(), BOT_FILL_START_MS);
      this.broadcastStatus();
    }

    const session = new TableSession({
      io: this.io,
      seatCount: SNG_SEAT_COUNT,
      humans: humans.map((h) => ({ userId: h.userId, displayName: h.displayName, avatarKey: h.avatarKey })),
    });

    const humanUserIds = humans.map((h) => h.userId);
    this.onSessionReady(session, humanUserIds);

    for (const h of humans) session.attachHuman(h.socket, h.userId);

    try {
      await session.start();
    } catch (err) {
      console.error("[sngMatchmaker] failed to start batch:", err);
      for (const h of humans) h.socket.emit("joinGameError", { message: "参加処理に失敗しました" });
    }
  }
}
