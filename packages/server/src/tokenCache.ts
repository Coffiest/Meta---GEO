/**
 * アクセストークン検証結果の短期キャッシュ。
 *
 * Supabaseの `auth.getUser()` は認証APIへのHTTP往復(TLSハンドシェイク込み)で、これを
 * 「APIリクエストごとに毎回」行うと共有CPU1コアのVMでは主要なボトルネックになる。
 * ホーム画面は同じトークンで十数本のAPIを同時に叩くため、1回の画面表示で十数回の往復が
 * 発生していた。
 *
 * ここでは2つの重複を取り除く:
 *  - 時間方向: 同じトークンの検証結果を短時間だけ使い回す
 *  - 同時方向: 同じトークンの検証が並列に来たら1本にまとめて相乗りさせる
 *
 * 安全性: キャッシュの寿命はトークン自身の有効期限(exp)で必ず打ち切る。したがって
 * 期限切れのトークンがキャッシュ経由で通ることはない。
 */

export interface VerifiedUser {
  authId: string;
  email: string | null;
}

/** 検証成功をキャッシュする時間。 */
const POSITIVE_TTL_MS = 60_000;
/** 無効なトークンで叩かれ続けたときに毎回往復しないための短いキャッシュ。 */
const NEGATIVE_TTL_MS = 5_000;
/** キャッシュの上限件数(超えたら古いものから捨てる)。 */
const CACHE_LIMIT = 2_000;

export interface TokenCacheStats {
  /** verify の呼び出し回数。 */
  calls: number;
  /** そのうちキャッシュ/相乗りで済んだ回数。 */
  cacheHits: number;
  /** 実際に検証(HTTP往復)した回数。 */
  remoteCalls: number;
  /** 往復1回あたりの平均ms(往復が無ければnull)。 */
  avgRemoteMs: number | null;
  /** 往復の最大ms。 */
  maxRemoteMs: number;
}

export interface TokenVerifier {
  verify(accessToken: string | undefined): Promise<VerifiedUser | null>;
  stats(): TokenCacheStats;
  /** サインアウト等でトークンを即座に無効化する。 */
  invalidate(accessToken: string): void;
}

interface CacheEntry {
  user: VerifiedUser | null;
  expiresAt: number;
}

/**
 * JWTのペイロードを「検証せずに」読み出す。署名の検証は呼び出し先(Supabase / Firebase)に
 * 任せており、ここで読むのは次の2つだけ:
 *  - exp … キャッシュを保持してよい上限時刻を知るため
 *  - iss … どちらの発行元のトークンかを振り分けるため
 * どちらも「信用する」情報ではない(exp は上限を狭める方向にしか使わず、iss は検証先を
 * 選ぶだけで、選んだ先が改めて署名を検証する)。読めなければ null。
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** JWTのexp(ミリ秒)。読めなければnull。 */
export function readTokenExpiryMs(token: string): number | null {
  const exp = decodeJwtPayload(token)?.["exp"];
  return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
}

/** JWTのiss(発行者)。読めなければnull。どの発行元へ検証しに行くかの振り分けに使う。 */
export function readTokenIssuer(token: string): string | null {
  const iss = decodeJwtPayload(token)?.["iss"];
  return typeof iss === "string" ? iss : null;
}

/**
 * 実際の検証処理(HTTP往復)を包んで、キャッシュと相乗りを足したものを返す。
 * `now` はテストから時間を進めるための差し替え口。
 */
export function createTokenVerifier(
  verifyRemote: (accessToken: string) => Promise<VerifiedUser | null>,
  now: () => number = Date.now,
): TokenVerifier {
  const cache = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<VerifiedUser | null>>();
  const counters = { calls: 0, cacheHits: 0, remoteCalls: 0, totalRemoteMs: 0, maxRemoteMs: 0 };

  function readCache(token: string): CacheEntry | null {
    const hit = cache.get(token);
    if (!hit) return null;
    if (hit.expiresAt <= now()) {
      cache.delete(token);
      return null;
    }
    // 参照されたものを末尾へ移し、古いものから捨てられるようにする。
    cache.delete(token);
    cache.set(token, hit);
    return hit;
  }

  function writeCache(token: string, user: VerifiedUser | null): void {
    const at = now();
    let expiresAt = at + (user ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS);
    if (user) {
      // トークンの有効期限を越えてキャッシュしない(失効後も通ってしまうのを防ぐ)。
      const tokenExpiry = readTokenExpiryMs(token);
      if (tokenExpiry !== null) expiresAt = Math.min(expiresAt, tokenExpiry);
      if (expiresAt <= at) return;
    }
    cache.set(token, { user, expiresAt });
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
  }

  return {
    async verify(accessToken) {
      if (!accessToken) return null;
      counters.calls += 1;

      const cached = readCache(accessToken);
      if (cached) {
        counters.cacheHits += 1;
        return cached.user;
      }

      // 同じトークンの検証が既に走っていれば、その結果に相乗りする(往復は1回だけ)。
      const running = inflight.get(accessToken);
      if (running) {
        counters.cacheHits += 1;
        return running;
      }

      const request = (async () => {
        const started = performance.now();
        try {
          const user = await verifyRemote(accessToken);
          const elapsed = performance.now() - started;
          counters.remoteCalls += 1;
          counters.totalRemoteMs += elapsed;
          if (elapsed > counters.maxRemoteMs) counters.maxRemoteMs = elapsed;
          writeCache(accessToken, user);
          return user;
        } finally {
          inflight.delete(accessToken);
        }
      })();

      inflight.set(accessToken, request);
      return request;
    },

    stats() {
      return {
        calls: counters.calls,
        cacheHits: counters.cacheHits,
        remoteCalls: counters.remoteCalls,
        avgRemoteMs: counters.remoteCalls > 0 ? Math.round(counters.totalRemoteMs / counters.remoteCalls) : null,
        maxRemoteMs: Math.round(counters.maxRemoteMs),
      };
    },

    invalidate(accessToken) {
      cache.delete(accessToken);
    },
  };
}
