/**
 * ①⑦⑧ X(Twitter)からの読み取り。
 *
 * X API は無料枠では読み取りができず、Basic以上の契約と Bearer token が要る。
 * 鍵が無い環境の方が普通なので、**鍵が無くても落ちない**ことを最優先に設計してある:
 *
 *  - 鍵が無ければ `{ ok: false, reason: "no-credentials" }` を返す。例外は投げない
 *  - 呼び出し側(日次バッチ)は、鍵が無い日を「取得0件」ではなく「未設定」として記録できる
 *
 * これにより、鍵を GitHub Secrets に入れた瞬間から自動収集が始まり、
 * それまでは管理画面からの手入力で同じデータを積める(どちらでも推移は同じように出る)。
 */

const API_BASE = "https://api.x.com/2";

export type XFailure =
  /** 鍵が設定されていない。エラーではなく「まだ使えない」状態。 */
  | { ok: false; reason: "no-credentials" }
  /** 鍵はあるが拒否された(期限切れ・権限不足・プラン不足)。 */
  | { ok: false; reason: "unauthorized"; status: number }
  /** レート上限。時間をおけば回復する。 */
  | { ok: false; reason: "rate-limited"; status: number }
  /** それ以外(通信断・想定外の応答)。 */
  | { ok: false; reason: "error"; message: string };

export type XResult<T> = { ok: true; data: T } | XFailure;

/** 鍵が設定されているか。管理画面で「未設定」と出すために使う。 */
export function hasXCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  const token = env["X_BEARER_TOKEN"];
  return typeof token === "string" && token.trim().length > 0;
}

async function call<T>(
  path: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
): Promise<XResult<T>> {
  const token = env["X_BEARER_TOKEN"];
  if (!token || token.trim().length === 0) return { ok: false, reason: "no-credentials" };

  try {
    const res = await fetchImpl(`${API_BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "unauthorized", status: res.status };
    if (res.status === 429) return { ok: false, reason: "rate-limited", status: res.status };
    if (!res.ok) return { ok: false, reason: "error", message: `HTTP ${res.status}` };
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/** ⑦ アカウントの公開指標。 */
export interface XAccountMetrics {
  handle: string;
  followers: number;
  following: number;
  posts: number;
}

interface XUserResponse {
  data?: { username: string; public_metrics?: { followers_count: number; following_count: number; tweet_count: number } };
}

/** ①⑦ 指定ハンドルのフォロワー数などを取る。競合・自社の両方に使う。 */
export async function fetchAccountMetrics(
  handle: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<XResult<XAccountMetrics>> {
  const clean = handle.replace(/^@/, "");
  const r = await call<XUserResponse>(
    `/users/by/username/${encodeURIComponent(clean)}?user.fields=public_metrics`,
    env,
    fetchImpl,
  );
  if (!r.ok) return r;
  const m = r.data.data?.public_metrics;
  if (!m) return { ok: false, reason: "error", message: "public_metrics が応答に含まれていない" };
  return {
    ok: true,
    data: {
      handle: r.data.data!.username,
      followers: m.followers_count,
      following: m.following_count,
      posts: m.tweet_count,
    },
  };
}

/** ⑧ メンション1件。 */
export interface XMention {
  id: string;
  text: string;
  authorId: string | null;
  createdAt: string | null;
}

interface XSearchResponse {
  data?: { id: string; text: string; author_id?: string; created_at?: string }[];
}

/**
 * ⑧ 自社への言及を検索する。
 *
 * `query` は X の検索構文。リポストを除くのが既定(同じ文面が大量に流れて監視の意味が薄れるため)。
 */
export async function searchMentions(
  query: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  maxResults = 50,
): Promise<XResult<XMention[]>> {
  const q = `${query} -is:retweet`;
  const r = await call<XSearchResponse>(
    `/tweets/search/recent?query=${encodeURIComponent(q)}&max_results=${Math.min(Math.max(maxResults, 10), 100)}&tweet.fields=created_at,author_id`,
    env,
    fetchImpl,
  );
  if (!r.ok) return r;
  return {
    ok: true,
    data: (r.data.data ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      authorId: t.author_id ?? null,
      createdAt: t.created_at ?? null,
    })),
  };
}

/** 失敗を人が読める1行にする。ログと管理画面の両方で使う。 */
export function describeFailure(f: XFailure): string {
  switch (f.reason) {
    case "no-credentials":
      return "X APIの鍵(X_BEARER_TOKEN)が未設定です。設定すると自動収集が始まります。";
    case "unauthorized":
      return `X APIに拒否されました(HTTP ${f.status})。鍵の期限切れ、権限不足、またはプラン不足の可能性があります。`;
    case "rate-limited":
      return `X APIのレート上限に達しました(HTTP ${f.status})。時間をおいて再試行します。`;
    case "error":
      return `X APIの呼び出しに失敗しました: ${f.message}`;
  }
}
