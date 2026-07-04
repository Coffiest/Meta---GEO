import type { Server, Socket } from "socket.io";
import { getOrCreateUserByAuthId, prisma, SIGNUP_BONUS } from "@meta-geo/db";
import { authAvailable, verifyAccessToken } from "./auth.js";
import { TableSession } from "./gameServer.js";

const SEAT_COUNT = 6;

/**
 * 参加可能なゲーム種別の一覧(サーバー側の許可リスト)。クライアントはgameKeyのみを送り、
 * buyIn等はここで決まる値を必ず使う(クライアントからの金額指定は信用しない)。
 *
 * MTTは現状シングルテーブルのTournamentエンジンを流用した簡易版で、本格的な複数卓バランシング
 * (packages/engineのMultiTableTournamentクラス)はまだソケットサーバーに統合されていない。
 * バイイン/賞金構造をSnGと変えることでゲームとしての違いは出しつつ、複数卓対応は今後の課題とする。
 */
export const GAME_CONFIGS = {
  sng: { gameType: "sng" as const, buyIn: 1000, seatCount: SEAT_COUNT },
  mtt: { gameType: "mtt" as const, buyIn: 2000, seatCount: SEAT_COUNT },
} satisfies Record<string, { gameType: "sng" | "mtt"; buyIn: number; seatCount: number }>;

export type GameKey = keyof typeof GAME_CONFIGS;

function isGameKey(key: unknown): key is GameKey {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(GAME_CONFIGS, key);
}

/**
 * ソケット接続を受け取り、認証・ユーザー解決を行った上でTableSessionへ振り分けるロビー。
 * 「プレイヤーがテーブルを立てるのではなく、システムがゲームを用意し参加する」という
 * 仕組み上、参加リクエストのたびに専用の卓を新しく作成する(相席/マッチングは未実装)。
 */
export class Lobby {
  private readonly io: Server;
  // 再接続時に同じ卓へ戻せるよう、ユーザーIDごとに進行中のセッションを保持する
  private readonly activeSessions = new Map<string, TableSession>();

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
  }

  private async resolveUser(socket: Socket): Promise<{ userId: string; displayName: string } | null> {
    const auth = socket.handshake.auth as { accessToken?: string; displayName?: string };

    if (authAvailable()) {
      const verified = await verifyAccessToken(auth.accessToken);
      if (!verified) return null;
      const fallbackName = verified.email?.split("@")[0] ?? "Player";
      const displayName = auth.displayName?.trim() || fallbackName;
      const user = await getOrCreateUserByAuthId({ authId: verified.authId, email: verified.email, displayName });
      return { userId: user.id, displayName: user.displayName };
    }

    // Supabase未設定のローカル開発用フォールバック: ソケットごとの使い捨てゲストユーザーとして扱う。
    // 通常のサインアップと同様にボーナスを付与しないとバイインを払えず参加できないため、
    // 新規作成時のみ記帳する(既存ゲストの再接続では二重付与しない)。
    const displayName = auth.displayName?.trim() || `Guest-${socket.id.slice(0, 4)}`;
    const guestEmail = `guest-${socket.id}@guests.meta-geo.local`;
    const existing = await prisma.user.findUnique({ where: { email: guestEmail } });
    const user =
      existing ??
      (await prisma.user.create({ data: { email: guestEmail, displayName, isBot: false } }));
    if (!existing) {
      await prisma.bankrollTransaction.create({ data: { userId: user.id, amount: SIGNUP_BONUS, kind: "signupBonus" } });
    }
    return { userId: user.id, displayName: user.displayName };
  }

  private async handleJoinGame(socket: Socket, payload: { gameKey?: string }): Promise<void> {
    if (!isGameKey(payload.gameKey)) {
      socket.emit("joinGameError", { message: "不正なゲーム種別です" });
      return;
    }

    const resolved = await this.resolveUser(socket);
    if (!resolved) {
      socket.emit("joinGameError", { message: "認証に失敗しました。再度ログインしてください" });
      return;
    }

    const existing = this.activeSessions.get(resolved.userId);
    if (existing && !existing.isFinished()) {
      existing.attachHuman(socket);
      return;
    }

    const config = GAME_CONFIGS[payload.gameKey];
    const session = new TableSession({
      io: this.io,
      gameType: config.gameType,
      buyIn: config.buyIn,
      seatCount: config.seatCount,
      humanUserId: resolved.userId,
      humanDisplayName: resolved.displayName,
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
