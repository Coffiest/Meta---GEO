import type { Server, Socket } from "socket.io";
import { getOrCreateUserByAuthId, prisma } from "@meta-geo/db";
import { authAvailable, verifyAccessToken } from "./auth.js";
import { TableSession, type GameSession } from "./gameServer.js";
import { MttSession } from "./mttSession.js";

const SEAT_COUNT = 6;

/**
 * 参加可能なゲーム種別の一覧(サーバー側の許可リスト)。クライアントはgameKeyのみを送り、
 * buyIn等はここで決まる値を必ず使う(クライアントからの金額指定は信用しない)。
 */
export const GAME_CONFIGS = {
  sng: { gameType: "sng" as const, buyIn: 1000, seatCount: SEAT_COUNT, fieldSize: SEAT_COUNT },
  mtt: { gameType: "mtt" as const, buyIn: 2000, seatCount: SEAT_COUNT, fieldSize: 12 },
} satisfies Record<string, { gameType: "sng" | "mtt"; buyIn: number; seatCount: number; fieldSize: number }>;

export type GameKey = keyof typeof GAME_CONFIGS;

function isGameKey(key: unknown): key is GameKey {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(GAME_CONFIGS, key);
}

interface ResolvedUser {
  userId: string;
  displayName: string;
  avatarKey: string | null;
}

/**
 * ソケット接続を受け取り、認証・ユーザー解決を行った上でゲームセッションへ振り分けるロビー。
 * 「プレイヤーがテーブルを立てるのではなく、システムがゲームを用意し参加する」という
 * 仕組み上、参加リクエストのたびに専用のゲームが新しく作成される。
 */
export class Lobby {
  private readonly io: Server;
  // 再接続時に同じゲームへ戻せるよう、ユーザーIDごとに進行中のセッションを保持する
  private readonly activeSessions = new Map<string, GameSession>();

  constructor(io: Server) {
    this.io = io;
  }

  handleConnection(socket: Socket): void {
    socket.on("joinGame", (payload: { gameKey?: string }) => {
      this.handleJoinGame(socket, payload ?? {}).catch((err) => {
        console.error(`[lobby] joinGame failed for ${socket.id}:`, err);
        socket.emit("joinGameError", { message: "参加処理に失敗しました" });
      });
    });

    socket.on("leaveGame", () => {
      const userId = socket.data["userId"] as string | undefined;
      if (!userId) return;
      const session = this.activeSessions.get(userId);
      if (session) {
        session.leave();
        this.activeSessions.delete(userId);
      }
    });
  }

  private async resolveUser(socket: Socket): Promise<ResolvedUser | null> {
    const auth = socket.handshake.auth as { accessToken?: string; displayName?: string; avatarKey?: string };

    if (authAvailable()) {
      const verified = await verifyAccessToken(auth.accessToken);
      if (!verified) return null;
      const fallbackName = verified.email?.split("@")[0] ?? "Player";
      const user = await getOrCreateUserByAuthId({ authId: verified.authId, email: verified.email, displayName: fallbackName });
      // オンボーディング(名前+アバター設定)未完了ならゲーム参加を拒否する
      if (!user.onboarded) return null;
      return { userId: user.id, displayName: user.displayName, avatarKey: user.avatarKey };
    }

    // Supabase未設定のローカル開発用フォールバック: ソケットごとの使い捨てゲストユーザーとして扱う
    const displayName = auth.displayName?.trim() || `Guest-${socket.id.slice(0, 4)}`;
    const avatarKey = typeof auth.avatarKey === "string" ? auth.avatarKey : null;
    const guestEmail = `guest-${socket.id}@guests.meta-geo.local`;
    const existing = await prisma.user.findUnique({ where: { email: guestEmail } });
    const user =
      existing ??
      (await prisma.user.create({ data: { email: guestEmail, displayName, isBot: false, avatarKey, onboarded: true } }));
    return { userId: user.id, displayName: user.displayName, avatarKey: user.avatarKey };
  }

  private async handleJoinGame(socket: Socket, payload: { gameKey?: string }): Promise<void> {
    if (!isGameKey(payload.gameKey)) {
      socket.emit("joinGameError", { message: "不正なゲーム種別です" });
      return;
    }

    const resolved = await this.resolveUser(socket);
    if (!resolved) {
      socket.emit("joinGameError", { message: "認証またはプロフィール設定が完了していません" });
      return;
    }
    socket.data["userId"] = resolved.userId;

    const existing = this.activeSessions.get(resolved.userId);
    if (existing && !existing.isFinished() && !existing.isHumanDone()) {
      existing.attachHuman(socket);
      return;
    }

    const config = GAME_CONFIGS[payload.gameKey];
    const session: GameSession =
      config.gameType === "mtt"
        ? new MttSession({
            io: this.io,
            buyIn: config.buyIn,
            tableSeatCount: config.seatCount,
            fieldSize: config.fieldSize,
            humanUserId: resolved.userId,
            humanDisplayName: resolved.displayName,
            humanAvatarKey: resolved.avatarKey,
          })
        : new TableSession({
            io: this.io,
            gameType: config.gameType,
            buyIn: config.buyIn,
            seatCount: config.seatCount,
            humanUserId: resolved.userId,
            humanDisplayName: resolved.displayName,
            humanAvatarKey: resolved.avatarKey,
          });
    this.activeSessions.set(resolved.userId, session);
    session.attachHuman(socket);

    try {
      await session.start();
    } catch (err) {
      this.activeSessions.delete(resolved.userId);
      socket.emit("joinGameError", { message: err instanceof Error ? err.message : "参加処理に失敗しました" });
    }
  }
}
