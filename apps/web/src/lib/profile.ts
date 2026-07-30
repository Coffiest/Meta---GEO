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

/** プロフィール取得が失敗した理由。画面に具体的な原因を出すために保持する。 */
export interface ProfileFetchFailure {
  /** 人が読める失敗理由(画面に出す)。 */
  message: string;
  /** HTTPステータス(応答自体が無ければnull)。 */
  status: number | null;
  /** 要求にかかった時間(ms)。長ければサーバー側の詰まりを示す。 */
  durationMs: number;
}

let lastProfileFailure: ProfileFetchFailure | null = null;

/** 直近のプロフィール取得失敗の詳細。成功していればnull。 */
export function getLastProfileFailure(): ProfileFetchFailure | null {
  return lastProfileFailure;
}

export async function fetchProfile(accessToken: string): Promise<Profile | null> {
  // サーバーが応答不能(ハング/再起動中)でも「読み込み中…」で永久に固まらないよう10秒で打ち切る。
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${SERVER_URL}/api/lobby/profile`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: ctrl.signal,
    });
    const durationMs = Date.now() - startedAt;
    if (!res.ok) {
      // 本文にサーバー側の理由が入っていることがあるので拾う(長すぎる場合は切る)。
      const body = await res.text().catch(() => "");
      lastProfileFailure = {
        message: `サーバーが ${res.status} ${res.statusText} を返しました${body ? `: ${body.slice(0, 200)}` : ""}`,
        status: res.status,
        durationMs,
      };
      return null;
    }
    lastProfileFailure = null;
    return (await res.json()) as Profile;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const aborted = err instanceof Error && err.name === "AbortError";
    lastProfileFailure = {
      message: aborted
        ? `サーバーが10秒以内に応答しませんでした(サーバーが過負荷か再起動中の可能性)`
        : `サーバーに接続できません: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`,
      status: null,
      durationMs,
    };
    throw err;
  } finally {
    clearTimeout(timeout);
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

/** ログイン済みユーザーのプロフィールを取得するフック。ゲスト(トークン無し)ではnullのまま。 */
export function useProfile(accessToken: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(Boolean(accessToken));

  const reload = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      setProfile(await fetchProfile(accessToken));
    } catch {
      // ネットワーク断・タイムアウト時は profile=null のまま loading を終える。
      // page.tsx 側が「再読み込み」ボタン付きの失敗画面を出すため、永久の「読み込み中…」にはならない。
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setProfile(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [accessToken, reload]);

  return { profile, loading, reload, setProfile };
}
