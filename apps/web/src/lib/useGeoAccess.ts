"use client";

import { useEffect, useState } from "react";
import { fetchGeoAccess, setGeoAccessToken, type GeoAccessStatus } from "./geoApi";

/** ロック画面に出す、今の回数と必要な回数。stage はどの段階の錠か。 */
export interface GeoLockInfo {
  itmCount: number;
  required: number;
  stage: "preflop" | "postflop";
}

/**
 * GEO DATABASE の利用条件の状態。データベースタブの画面が最初に確かめる。
 * インマネ10回でプリフロップまで、20回でポストフロップ以降とデータ研究(オーナー確定)。
 * need: その画面に必要な段階(GEO の木は "preflop"、データ研究は "full")。
 * 認証が無い環境(ゲスト・開発)では条件を課さない(サーバーも同じ)。
 * 取得に失敗したときは使える扱いにして先へ進む(本当に条件を満たしていなければ、API が 403 を返して錠になる)。
 */
export type GeoAccessState =
  | { status: "loading" }
  | { status: "unlocked"; postflopLock: Omit<GeoLockInfo, "stage"> | null }
  | ({ status: "locked" } & GeoLockInfo);

export function useGeoAccess(params: {
  authAvailable: boolean;
  loading: boolean;
  accessToken: string | null;
  need?: "preflop" | "full";
}): {
  state: GeoAccessState;
  lock: (info: GeoLockInfo) => void;
} {
  const { authAvailable, loading, accessToken, need = "preflop" } = params;
  const [state, setState] = useState<GeoAccessState>({ status: "loading" });
  useEffect(() => {
    setGeoAccessToken(accessToken);
    if (loading) return;
    if (!authAvailable || !accessToken) {
      setState({ status: "unlocked", postflopLock: null });
      return;
    }
    let cancelled = false;
    void fetchGeoAccess(accessToken).then((r) => {
      if (cancelled) return;
      setState(stateOf(r, need));
    });
    return () => {
      cancelled = true;
    };
  }, [authAvailable, loading, accessToken, need]);
  return { state, lock: (info) => setState({ status: "locked", ...info }) };
}

function stateOf(r: GeoAccessStatus | null, need: "preflop" | "full"): GeoAccessState {
  if (!r) return { status: "unlocked", postflopLock: null };
  if (!r.unlocked) return { status: "locked", itmCount: r.itmCount, required: r.required, stage: "preflop" };
  const postflopUnlocked = r.postflopUnlocked ?? true;
  const postflopRequired = r.postflopRequired ?? r.required;
  if (postflopUnlocked) return { status: "unlocked", postflopLock: null };
  if (need === "full") return { status: "locked", itmCount: r.itmCount, required: postflopRequired, stage: "postflop" };
  return { status: "unlocked", postflopLock: { itmCount: r.itmCount, required: postflopRequired } };
}
