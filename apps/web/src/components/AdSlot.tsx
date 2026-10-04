"use client";

import { createContext, useContext, useEffect, useRef } from "react";

import { ADSENSE_CLIENT_ID, adSlotId, adsAllowedFor, type AdPlacement } from "@/lib/adsense";
import { useSubscriptionStatus } from "@/lib/subscription";

/**
 * Google AdSense の広告枠。
 *
 * 広告スクリプト自体(pagead2.googlesyndication.com)は layout.tsx で一度だけ読み込む。
 * ここでは `<ins class="adsbygoogle">` を配置し、マウント時に
 * `(adsbygoogle = window.adsbygoogle || []).push({})` でそのユニットの描画を要求する
 * (AdSenseの標準的な組み込み方式)。
 *
 * **その置き場所の広告ユニットがまだ無い間は、枠ごと何も描画しない。** 空白やダミー広告は出さない。
 * 審査を通してユニットを作り、スロットIDを環境変数に入れた時点で自動的に出るようになる
 * (コード変更は不要。詳細は lib/adsense.ts)。
 */
declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * 広告を出してよいかどうか。**有料プラン(使い放題プラン)の加入者には出さない** ―― 課金したのに
 * 広告が出ると解約理由になるし、「広告が消える」こと自体がプランの価値にもなるため。
 *
 * Provider が無い文脈(ガイド等のログイン不要なコンテンツページ)では既定で true。
 */
const AdsAllowedContext = createContext(true);

export function AdsAllowedProvider({
  accessToken,
  children,
}: {
  accessToken: string | undefined;
  children: React.ReactNode;
}) {
  const { status, loading } = useSubscriptionStatus(accessToken);
  const allowed = adsAllowedFor({ hasToken: Boolean(accessToken), loading, status });

  return <AdsAllowedContext.Provider value={allowed}>{children}</AdsAllowedContext.Provider>;
}

export function useAdsAllowed(): boolean {
  return useContext(AdsAllowedContext);
}

export function AdSlot({ placement, label = "広告" }: { placement: AdPlacement; label?: string }) {
  const slot = adSlotId(placement);
  const allowed = useAdsAllowed();
  const insRef = useRef<HTMLModElement>(null);
  const pushedRef = useRef(false);

  const active = Boolean(slot) && allowed;

  useEffect(() => {
    if (!active || pushedRef.current || !insRef.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch {
      // AdSenseスクリプト未読み込み(ネットワーク遮断・広告ブロッカー等)でも画面自体は壊さない。
    }
  }, [active]);

  if (!active || !slot) return null;

  return (
    <div className="w-full overflow-hidden rounded-2xl bg-surface/80">
      <p className="px-1 pb-1 text-[9px] font-bold uppercase tracking-wider text-fg-3">{label}</p>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
