import { activeGames, type ActiveGameKey } from "./activeGames.js";

/**
 * 管理者画面の「いまアクティブなユーザー」。サーバーのメモリにだけ持つ(再起動で消えてよい情報)。
 *
 * - ログイン中の API 呼び出し(ロビー)と、卓への参加・復帰のたびに「最後に見えた時刻」を更新する。
 * - アクティブ = 最後に見えてから ACTIVE_WINDOW_MS 以内か、いま卓で遊んでいる人。
 *   卓で遊んでいる間は API をほとんど呼ばないので、activeGames(進行中のゲーム)も合わせて見る。
 * - 24時間より古い記録は捨てる。
 */
export const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const KEEP_MS = 24 * 60 * 60 * 1000;

interface Seen {
  displayName: string;
  lastSeenAt: number;
}

const seen = new Map<string, Seen>();

export function touchPresence(userId: string, displayName: string): void {
  seen.set(userId, { displayName, lastSeenAt: Date.now() });
}

export interface PresenceRow {
  userId: string;
  displayName: string;
  /** 最後に見えた時刻(ISO)。卓で遊んでいるだけで一度も見えていなければ null。 */
  lastSeenAt: string | null;
  /** いま遊んでいるゲーム(無ければ null)。 */
  playing: ActiveGameKey | null;
}

export interface PresenceSnapshot {
  /** いまアクティブな人数。 */
  activeCount: number;
  /** うち卓で遊んでいる人数。 */
  playingCount: number;
  /** 直近24時間(サーバーの起動以降)に見えた人数。 */
  last24hCount: number;
  users: PresenceRow[];
}

/** names: 卓で遊んでいるが一度も見えていない人の表示名を引くための関数(DB)。 */
export async function presenceSnapshot(
  namesOf: (userIds: string[]) => Promise<Map<string, string>>
): Promise<PresenceSnapshot> {
  const now = Date.now();
  for (const [id, s] of seen) if (now - s.lastSeenAt > KEEP_MS) seen.delete(id);

  const rows = new Map<string, PresenceRow>();
  for (const [userId, s] of seen) {
    if (now - s.lastSeenAt > ACTIVE_WINDOW_MS) continue;
    rows.set(userId, {
      userId,
      displayName: s.displayName,
      lastSeenAt: new Date(s.lastSeenAt).toISOString(),
      playing: activeGames.getActive(userId),
    });
  }
  const unseenPlayers = activeGames.activeUserIds().filter((id) => !rows.has(id));
  const names = unseenPlayers.length > 0 ? await namesOf(unseenPlayers) : new Map<string, string>();
  for (const userId of unseenPlayers) {
    const s = seen.get(userId);
    rows.set(userId, {
      userId,
      displayName: s?.displayName ?? names.get(userId) ?? userId.slice(0, 8),
      lastSeenAt: s ? new Date(s.lastSeenAt).toISOString() : null,
      playing: activeGames.getActive(userId),
    });
  }

  const users = [...rows.values()].sort((a, b) => {
    if (Boolean(a.playing) !== Boolean(b.playing)) return a.playing ? -1 : 1;
    return (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "");
  });
  return {
    activeCount: users.length,
    playingCount: users.filter((u) => u.playing).length,
    last24hCount: seen.size,
    users,
  };
}
