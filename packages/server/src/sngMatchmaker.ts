import type { Server, Socket } from "socket.io";
import { TableSession, SNG_SEAT_COUNT, type HumanPlayer, type GameSession } from "./gameServer.js";

const MATCH_TIMEOUT_MS = 15_000;

interface QueuedPlayer extends HumanPlayer {
  socket: Socket;
}

/**
 * SNGのマッチング待合室。「ポーカーチェイス」のような「マッチング中…」表示のため、
 * 6人揃うか15秒経過するまで人間プレイヤーをキューに貯めてから卓を立てる(人間を優先マッチング)。
 * 揃わなかった余りの席だけをBOTで埋める。SNGは途中参加・リエントリー不可(卓成立後は締切)。
 */
export class SngMatchmaker {
  private queue: QueuedPlayer[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private batchStartedAt = 0;
  private readonly io: Server;
  private readonly onSessionReady: (session: GameSession, humanUserIds: string[]) => void;

  constructor(io: Server, onSessionReady: (session: GameSession, humanUserIds: string[]) => void) {
    this.io = io;
    this.onSessionReady = onSessionReady;
  }

  isQueued(userId: string): boolean {
    return this.queue.some((p) => p.userId === userId);
  }

  join(player: HumanPlayer, socket: Socket): void {
    if (this.isQueued(player.userId)) {
      this.emitStatus(socket);
      return;
    }
    this.queue.push({ ...player, socket });
    if (this.queue.length === 1) {
      this.batchStartedAt = Date.now();
      this.timer = setTimeout(() => void this.startBatch(), MATCH_TIMEOUT_MS);
    }
    socket.on("disconnect", () => this.leaveQueue(player.userId));
    this.broadcastStatus();

    if (this.queue.length >= SNG_SEAT_COUNT) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      void this.startBatch();
    }
  }

  leaveQueue(userId: string): void {
    const before = this.queue.length;
    this.queue = this.queue.filter((p) => p.userId !== userId);
    if (this.queue.length === before) return;
    if (this.queue.length === 0 && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.broadcastStatus();
  }

  private emitStatus(socket: Socket): void {
    const secondsLeft = this.timer ? Math.max(0, Math.ceil((MATCH_TIMEOUT_MS - (Date.now() - this.batchStartedAt)) / 1000)) : null;
    socket.emit("sngMatching", { registered: this.queue.length, needed: SNG_SEAT_COUNT, secondsLeft });
  }

  private broadcastStatus(): void {
    for (const p of this.queue) this.emitStatus(p.socket);
  }

  private async startBatch(): Promise<void> {
    this.timer = null;
    if (this.queue.length === 0) return;
    const humans = this.queue.splice(0, SNG_SEAT_COUNT);
    for (const h of humans) h.socket.emit("sngMatching", { registered: humans.length, needed: SNG_SEAT_COUNT, secondsLeft: 0, starting: true });

    // 7人以上が同時に並んでいた場合、あふれた人間は取り残さず次の卓のマッチングを即開始する
    // (人間優先: 余った人間だけで新しい待合を作り、締切後に不足分をBOTで埋める)。
    if (this.queue.length > 0) {
      this.batchStartedAt = Date.now();
      this.timer = setTimeout(() => void this.startBatch(), MATCH_TIMEOUT_MS);
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
