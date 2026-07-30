"use client";

import { useCallback, useEffect, useState } from "react";

export interface Profile {
  id: string;
  displayName: string;
  avatarKey: string | null;
  onboarded: boolean;
  email: string | null;
}

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

/** プロフィール取得失敗の原因分類。UIで具体的なエラーメッセージを出し分けるために使う。 */
export type ProfileErrorReason =
  | "no-token" // アクセストークンが無い(セッション未確立)
  | "timeout" // 15秒以内に応答が無い(サーバーのコールドスタート/ハング等)
  | "network" // fetch自体が失敗(オフライン/CORS/DNS/インアプリブラウザのブロック等)
  | "unauthorized" // 401/403(トークン期限切れ・無効)
  | "notfound" // 404(エンドポイント不一致/プロフィール未作成)
  | "server" // 5xx(サーバー内部エラー・DB接続不可等)
  | "http" // その他の非2xx
  | "parse"; // 応答は来たがJSONとして解釈できない

export interface ProfileError {
  reason: ProfileErrorReason;
  /** HTTPステータス(あれば)。 */
  status?: number;
  /** 開発者向けの短い詳細(サーバー本文の先頭・例外メッセージ等)。 */
  detail?: string;
}

export type ProfileFetchResult = { ok: true; profile: Profile } | { ok: false; error: ProfileError };

/** 一時的(=自動リトライで回復しうる)な失敗かどうか。 */
export function isTransientProfileError(reason: ProfileErrorReason): boolean {
  return reason === "timeout" || reason === "network" || reason === "server";
}

/**
 * プロフィールを取得する。失敗理由を細かく分類して返す(nullで潰さない)ことで、
 * UI側で原因の分かるエラーメッセージを出し、かつ一時的失敗のみ自動リトライできるようにする。
 * この関数自体は例外を投げない(すべて ProfileFetchResult に正規化する)。
 */
export async function fetchProfile(accessToken: string): Promise<ProfileFetchResult> {
  if (!accessToken) return { ok: false, error: { reason: "no-token" } };
  // サーバーが応答不能(ハング/コールドスタート中)でも固まらないよう15秒で打ち切る。
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/api/lobby/profile`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: ctrl.signal,
    });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      ok: false,
      error: {
        reason: aborted ? "timeout" : "network",
        detail: e instanceof Error ? e.message : String(e),
      },
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const reason: ProfileErrorReason =
      res.status === 401 || res.status === 403
        ? "unauthorized"
        : res.status === 404
          ? "notfound"
          : res.status >= 500
            ? "server"
            : "http";
    // サーバー本文の先頭だけ拾って詳細に載せる(原因特定の手がかり)。
    let detail: string | undefined;
    try {
      detail = (await res.text()).slice(0, 200) || undefined;
    } catch {
      /* 本文が読めなくても致命ではない */
    }
    return { ok: false, error: { reason, status: res.status, detail } };
  }

  try {
    const profile = (await res.json()) as Profile;
    return { ok: true, profile };
  } catch (e) {
    return { ok: false, error: { reason: "parse", status: res.status, detail: e instanceof Error ? e.message : String(e) } };
  }
}

export async function saveProfile(
  accessToken: string,
  params: { displayName: string; avatarKey: string | null },
): Promise<Profile | null> {
  const res = await fetch(`${SERVER_URL}/api/lobby/profile`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) return null;
  return (await res.json()) as Profile;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// 一時的失敗(コールドスタート/瞬断)は自動リトライで吸収する。指数バックオフの待ち時間(ms)。
const RETRY_DELAYS = [0, 1_000, 2_500, 5_000];

/** ログイン済みユーザーのプロフィールを取得するフック。ゲスト(トークン無し)ではnullのまま。 */
export function useProfile(accessToken: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(Boolean(accessToken));
  /** 直近の取得失敗の分類(成功時はnull)。page.tsxで原因の分かる文言を出すのに使う。 */
  const [error, setError] = useState<ProfileError | null>(null);

  const reload = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    let last: ProfileError | null = null;
    // 一時的失敗のみ、指数バックオフで最大4回まで自動リトライ。恒久的失敗(401/404等)は即座に確定。
    for (let i = 0; i < RETRY_DELAYS.length; i++) {
      if (RETRY_DELAYS[i]! > 0) await sleep(RETRY_DELAYS[i]!);
      const result = await fetchProfile(accessToken);
      if (result.ok) {
        setProfile(result.profile);
        setError(null);
        setLoading(false);
        return;
      }
      last = result.error;
      if (!isTransientProfileError(result.error.reason)) break; // 恒久的失敗はリトライしても無駄
    }
    // ここに来たら全リトライが失敗。profile=nullのままエラーを確定し、page.tsxが失敗画面を出す。
    setProfile(null);
    setError(last);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [accessToken, reload]);

  return { profile, loading, error, reload, setProfile };
}
