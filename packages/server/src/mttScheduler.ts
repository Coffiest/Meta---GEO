import type { Server, Socket } from "socket.io";
import { MttSession, MTT_MIN_PLAYERS_TO_START } from "./mttSession.js";
import type { HumanPlayer } from "./gameServer.js";

/** レジストレーションウィンドウ(30分)。次の周期は前回のレジクロ時刻から30分後に固定される。 */
export const MTT_REGISTRATION_WINDOW_MS = 30 * 60_000;

/**
 * MTTを30分周期で回し続けるスケジューラ。常に「今登録できるMTT」が1つ存在し、
 * ウィンドウが終わるとそのMTTのレジストレーションを締め切る(トーナメント自体は
 * 勝者が決まるまで裏で進行し続ける)と同時に次のMTTを新規オープンする。
 *
 * 例: 12:00にオープンしたMTTは12:30にレジクロ→そのタイミングで次のMTTがオープンし13:00にレジクロ…
 * という周期を、このプロセスが起動している限り繰り返す。
 */
export class MttScheduler {
  private current: MttSession;
  private readonly io: Server;
  private readonly windowMs: number;

  constructor(io: Server, windowMs: number = MTT_REGISTRATION_WINDOW_MS) {
    this.io = io;
    this.windowMs = windowMs;
    this.current = new MttSession(io);
    this.scheduleNextClose();
  }

  /** 現在レジストレーション中のMTT(登録先)を返す。 */
  getOpenSession(): MttSession {
    return this.current;
  }

  /** 特定のセッションを(離脱後の再参加判定などのために)IDで探す用途は今のところ不要。 */
  findSessionForUser(userId: string): MttSession | null {
    return this.current.hasUser(userId) ? this.current : null;
  }

  private scheduleNextClose(): void {
    setTimeout(() => this.rotate(), this.windowMs);
  }

  private rotate(): void {
    this.current.closeRegistration();
    this.current = new MttSession(this.io);
    this.scheduleNextClose();
  }

  /** 登録し、登録先となったMttSessionを返す(呼び出し側が再接続用に保持するため)。 */
  async register(player: HumanPlayer, socket: Socket): Promise<MttSession> {
    const target = this.current;
    await target.register(player, socket);
    return target;
  }
}

export { MTT_MIN_PLAYERS_TO_START };
