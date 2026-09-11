import type { Server, Socket } from "socket.io";
import { MttSession, MTT_MIN_PLAYERS_TO_START } from "./mttSession.js";
import type { HumanPlayer } from "./gameServer.js";

/**
 * MTTのロビー管理。常に「今登録できるMTT」が **1つだけ** 存在する。
 *
 * 仕組み(確定仕様):
 *  - 募集中のMTTは常に1つ。新規の人間はレジストレーションクローズ(RC)までその同じMTTへ相席する。
 *  - MTTは「4人(実人間)が集まった瞬間」または「最初の登録から15秒経過してボット補充で4人」で開始。
 *  - RCは **スタートから15分後**(固定周期ではなくスタート連動)。RCした瞬間に次の募集MTTが開く。
 *  - 参加できるMTTが同時に複数存在することは無い。
 */
export class MttScheduler {
  private current: MttSession;
  private readonly io: Server;

  constructor(io: Server) {
    this.io = io;
    this.current = this.openNew();
  }

  private openNew(): MttSession {
    // RC(登録締切)されたら、その瞬間に次の募集MTTを開く。
    return new MttSession(this.io, () => this.onCurrentClosed());
  }

  private onCurrentClosed(): void {
    // RC済みのセッションはこのまま裏で優勝者まで進行し続ける。募集先は新しいMTTへ切り替える。
    this.current = this.openNew();
  }

  /** 現在レジストレーション中のMTT(登録先)を返す。 */
  getOpenSession(): MttSession {
    return this.current;
  }

  findSessionForUser(userId: string): MttSession | null {
    return this.current.hasUser(userId) ? this.current : null;
  }

  /** 登録し、登録先となったMttSessionを返す(呼び出し側が再接続用に保持するため)。 */
  async register(player: HumanPlayer, socket: Socket): Promise<MttSession> {
    const target = this.current;
    await target.register(player, socket);
    return target;
  }
}

export { MTT_MIN_PLAYERS_TO_START };
