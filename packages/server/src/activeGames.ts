/**
 * ユーザーごとの「進行中ゲーム」と「未表示の終了結果」を保持する軽量レジストリ。
 * ソケットに依存しないHTTPエンドポイント(/api/lobby/active-game)からも参照できるよう、
 * Lobby/セッションと lobbyApi の橋渡しをするモジュールシングルトンとして実装する。
 *
 * 用途:
 *  - アプリ復帰/ログイン時に、そのユーザーが進行中のゲームを持っていれば強制的にそのゲームへ戻す。
 *  - 離席中にゲームが終了していた場合、復帰時に結果をサジェスト表示する(一度表示したら消す)。
 */
export type ActiveGameKey = "sng" | "mtt";

export interface ActiveGameResult {
  yourFinishPosition: number | null;
  yourPayout: number;
  winnerPlayerId: string | null;
  gameKey: ActiveGameKey;
}

class ActiveGameRegistry {
  private active = new Map<string, ActiveGameKey>();
  private results = new Map<string, ActiveGameResult>();

  setActive(userId: string, gameKey: ActiveGameKey): void {
    this.active.set(userId, gameKey);
  }

  clearActive(userId: string): void {
    this.active.delete(userId);
  }

  getActive(userId: string): ActiveGameKey | null {
    return this.active.get(userId) ?? null;
  }

  /** ゲーム終了時に呼ぶ。進行中フラグを消し、未表示結果として保存する。 */
  recordResult(userId: string, result: ActiveGameResult): void {
    this.active.delete(userId);
    this.results.set(userId, result);
  }

  /** 未表示の終了結果を取り出す(取り出したら消す=一度きりのサジェスト)。 */
  takeResult(userId: string): ActiveGameResult | null {
    const r = this.results.get(userId) ?? null;
    if (r) this.results.delete(userId);
    return r;
  }
}

export const activeGames = new ActiveGameRegistry();
