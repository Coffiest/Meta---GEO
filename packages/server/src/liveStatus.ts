/**
 * 進行中MTTの「公開ライブ状況」。配信者が画面に出したり、まだログインしていない人が
 * 「いま何人が戦っているのか」を見て流入するための、観戦用の最小限のスナップショット。
 *
 * 意図的に出さないもの:
 *  - ホールカード・進行中のアクション(覗き見による不正の余地を作らない)
 *  - BOTかどうかの区別(卓の内訳を露呈させない)
 * インメモリのみ。サーバーは単一マシン運用なので、これで全プレイヤーの状況を代表できる。
 */

/** この時間更新が無ければ「開催されていない」とみなす(終了後に古い数字を出し続けないため)。 */
const STALE_AFTER_MS = 90_000;

export interface LiveMttStatus {
  /** 生存者数。 */
  remaining: number;
  /** 総エントリー数。 */
  total: number;
  /** 平均スタック。 */
  averageStack: number;
  /** 現在のBB(スタックのBB換算を読み手が再計算できるように)。 */
  bigBlind: number;
  /** ファイナルテーブルに入っているか。 */
  isFinalTable: boolean;
  /** 賞金プール総額。 */
  prizePoolTotal: number;
  /** チップリーダー(表示名とBB持ち)。生存者がいなければnull。 */
  chipLeader: { displayName: string; bbStack: number } | null;
  /** 最終更新時刻(epoch ms)。 */
  updatedAt: number;
}

class LiveStatusStore {
  private current: LiveMttStatus | null = null;

  update(status: Omit<LiveMttStatus, "updatedAt">): void {
    this.current = { ...status, updatedAt: Date.now() };
  }

  /** 進行中のライブ状況。開催されていない/情報が古い場合はnull。 */
  get(): LiveMttStatus | null {
    if (!this.current) return null;
    if (Date.now() - this.current.updatedAt > STALE_AFTER_MS) return null;
    // 生存者0はトーナメント終了直後の残骸なので出さない。
    if (this.current.remaining <= 0) return null;
    return this.current;
  }
}

export const liveStatus = new LiveStatusStore();
