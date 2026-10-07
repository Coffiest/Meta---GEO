"use client";

import { useEffect, useState } from "react";
import { fetchGeoAccess, setGeoAccessToken, type GeoAccessStatus } from "./geoApi";
import type { GeoLockStage } from "@/components/geo/GeoLockScreen";

/** ロック画面に出す、今の回数と必要な回数。stage はどの段階の錠か。 */
export interface GeoLockInfo {
  itmCount: number;
  required: number;
  stage: GeoLockStage;
}

/**
 * GEO DATABASE の利用条件の状態。データベースタブの画面が最初に確かめる。
 * プランの上限(無料・シルバーは使えない / ゴールドはインマネ10回でプリフロップ・20回でポストフロップ / プラチナは全部)。
 * need: その画面に必要な段階(GEO の木は "preflop"、データ研究は "research" = プラチナだけ)。
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
  need?: "preflop" | "full" | "research";
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

function stateOf(r: GeoAccessStatus | null, need: "preflop" | "full" | "research"): GeoAccessState {
  if (!r) return { status: "unlocked", postflopLock: null };
  // 古いサーバーは plan / researchUnlocked を返さない(そのときはプランの錠を出さない)。
  if (need === "research" && r.researchUnlocked === false) {
    return { status: "locked", itmCount: r.itmCount, required: r.required, stage: "platinum" };
  }
  if (!r.unlocked && r.plan !== undefined && r.plan !== "gold" && r.plan !== "platinum") {
    return { status: "locked", itmCount: r.itmCount, required: r.required, stage: "gold" };
  }
  if (!r.unlocked) return { status: "locked", itmCount: r.itmCount, required: r.required, stage: "preflop" };
  const postflopUnlocked = r.postflopUnlocked ?? true;
  const postflopRequired = r.postflopRequired ?? r.required;
  if (postflopUnlocked) return { status: "unlocked", postflopLock: null };
  if (need !== "preflop") return { status: "locked", itmCount: r.itmCount, required: postflopRequired, stage: "postflop" };
  return { status: "unlocked", postflopLock: { itmCount: r.itmCount, required: postflopRequired } };
}
