"use client";

import { useEffect, useState } from "react";
import { fetchGeoAccess, setGeoAccessToken, type GeoAccessStatus } from "./geoApi";

/**
 * GEO DATABASE の利用条件(インマネ20回以上)の状態。データベースタブの画面が最初に確かめる。
 * 認証が無い環境(ゲスト・開発)では条件を課さない(サーバーも同じ)。
 * 取得に失敗したときは使える扱いにして先へ進む(本当に条件を満たしていなければ、API が 403 を返して錠になる)。
 */
export type GeoAccessState = { status: "loading" } | { status: "unlocked" } | ({ status: "locked" } & GeoAccessStatus);

export function useGeoAccess(params: { authAvailable: boolean; loading: boolean; accessToken: string | null }): {
  state: GeoAccessState;
  lock: (status: GeoAccessStatus) => void;
} {
  const { authAvailable, loading, accessToken } = params;
  const [state, setState] = useState<GeoAccessState>({ status: "loading" });
  useEffect(() => {
    setGeoAccessToken(accessToken);
    if (loading) return;
    if (!authAvailable || !accessToken) {
      setState({ status: "unlocked" });
      return;
    }
    let cancelled = false;
    void fetchGeoAccess(accessToken).then((r) => {
      if (cancelled) return;
      setState(r && !r.unlocked ? { status: "locked", ...r } : { status: "unlocked" });
    });
    return () => {
      cancelled = true;
    };
  }, [authAvailable, loading, accessToken]);
  return { state, lock: (s) => setState({ status: "locked", ...s }) };
}
