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

export async function fetchProfile(accessToken: string): Promise<Profile | null> {
  // サーバーが応答不能(ハング/再起動中)でも「読み込み中…」で永久に固まらないよう10秒で打ち切る。
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${SERVER_URL}/api/lobby/profile`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as Profile;
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
