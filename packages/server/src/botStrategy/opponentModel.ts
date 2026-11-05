import { getPlayerTendencies, type PlayerTendencies } from "@meta-geo/db";

/**
 * シャークが相手の癖を読むための、相手ごとの傾向(オーナー指示 2026-11-05)。
 *
 * - 通算: その人の直近 MODEL_HAND_LIMIT ハンドから集計(`getPlayerTendencies`)。
 * - その卓で見た打ち方: 記録は対局中もハンドごとに保存されるので、REFRESH_MS ごとに読み直して反映する。
 * 判断は同期で行うので、ここは「手元にあれば返す。古ければ裏で読み直す」だけ。初めて会う相手は読み終わるまで null。
 * 相手が人間でも自動の席でも同じように読む(分岐しない)。相手の手札は使わない。
 * Supabase の転送量を抑えるため、読むハンドは少なめにし、同じ人を何度も読まない。
 */
const MODEL_HAND_LIMIT = 500;
const REFRESH_MS = 10 * 60_000;
/** これより少ないハンドしか無い相手は、まだ読まない(偶然の偏りで突かない)。 */
export const MODEL_MIN_HANDS = 30;

interface Entry {
  at: number;
  loading: boolean;
  value: PlayerTendencies | null;
}

const cache = new Map<string, Entry>();

export function tendenciesOf(playerId: string): PlayerTendencies | null {
  const now = Date.now();
  let e = cache.get(playerId);
  if (!e) {
    e = { at: 0, loading: false, value: null };
    cache.set(playerId, e);
  }
  if (!e.loading && now - e.at > REFRESH_MS) {
    e.loading = true;
    const entry = e;
    getPlayerTendencies(playerId, MODEL_HAND_LIMIT)
      .then((v) => {
        entry.value = v;
      })
      .catch(() => {})
      .finally(() => {
        entry.at = Date.now();
        entry.loading = false;
      });
  }
  const v = e.value;
  return v && v.hands >= MODEL_MIN_HANDS ? v : null;
}

/** テスト用: 傾向を直接入れる。 */
export function setTendenciesForTest(playerId: string, v: PlayerTendencies): void {
  cache.set(playerId, { at: Date.now(), loading: false, value: v });
}
