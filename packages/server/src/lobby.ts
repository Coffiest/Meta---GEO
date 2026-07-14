import type { Server, Socket } from "socket.io";
import { getOrCreateUserByAuthId, prisma } from "@meta-geo/db";
import { authAvailable, verifyAccessToken } from "./auth.js";
import type { GameSession, HumanPlayer } from "./gameServer.js";
import { SngMatchmaker } from "./sngMatchmaker.js";
import { MttScheduler } from "./mttScheduler.js";
import { activeGames } from "./activeGames.js";

export type GameKey = "sng" | "mtt";

function isGameKey(key: unknown): key is GameKey {
  return key === "sng" || key === "mtt";
}

interface ResolvedUser {
  userId: string;
  displayName: string;
  avatarKey: string | null;
}

/**
 * ソケット接続を受け取り、認証・ユーザー解決を行った上でゲームセッションへ振り分けるロビー。
 * 「プレイヤーがテーブルを立てるのではなく、システムがゲームを用意し参加する」という
 * 仕組み上、SNGはマッチング待合室(6人揃うか60秒でBOT補充)、MTTは常時オープンな
 * 30分ローテーションのレジストレーション窓口(SngMatchmaker/MttScheduler)に委譲する。
 */
export class Lobby {
  private readonly io: Server;
  // 再接続時に同じゲームへ戻せるよう、ユーザーIDごとに進行中のセッションを保持する
  private readonly activeSessions = new Map<string, GameSession>();
  private readonly sngMatchmaker: SngMatchmaker;
  private readonly mttScheduler: MttScheduler;

  constructor(io: Server) {
    this.io = io;
    this.sngMatchmaker = new SngMatchmaker(io, (session, humanUserIds) => {
      for (const userId of humanUserIds) {
        this.activeSessions.set(userId, session);
        activeGames.setActive(userId, "sng");
      }
    });
    this.mttScheduler = new MttScheduler(io);
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
      this.sngMatchmaker.leaveQueue(userId);
      activeGames.clearActive(userId);
      const session = this.activeSessions.get(userId);
      if (session) {
        session.leave(userId);
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
      // オンボーディング(名前+アイコン設定)未完了ならゲーム参加を拒否する
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
    if (existing && !existing.isFinished() && !existing.isUserDone(resolved.userId)) {
      existing.attachHuman(socket, resolved.userId);
      return;
    }

    const player: HumanPlayer = { userId: resolved.userId, displayName: resolved.displayName, avatarKey: resolved.avatarKey };

    if (payload.gameKey === "sng") {
      this.sngMatchmaker.join(player, socket);
      return;
    }

    try {
      const session = await this.mttScheduler.register(player, socket);
      this.activeSessions.set(resolved.userId, session);
      activeGames.setActive(resolved.userId, "mtt");
    } catch (err) {
      socket.emit("joinGameError", { message: err instanceof Error ? err.message : "参加処理に失敗しました" });
    }
  }
}
