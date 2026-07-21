"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Google AdSense の広告枠。`NEXT_PUBLIC_ADSENSE_CLIENT_ID`(ca-pub-...)が未設定の間は
 * 何も描画しない(枠自体を消す。ダミー広告や空白は出さない)。AdSenseの審査通過後、
 * 環境変数を設定するだけで自動的に広告が出るようになる(コード変更不要)。
 *
 * 広告スクリプト自体(pagead2.googlesyndication.com)は layout.tsx で一度だけ読み込む。
 * ここでは <ins class="adsbygoogle"> を配置し、マウント時に (adsbygoogle = window.adsbygoogle || []).push({}) で
 * そのユニットの描画を要求する(AdSenseの標準的な組み込み方式)。
 */
declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdSlot({ slot, label = "広告" }: { slot: string; label?: string }) {
  const clientId = process.env["NEXT_PUBLIC_ADSENSE_CLIENT_ID"];
  const insRef = useRef<HTMLModElement>(null);
  const pushedRef = useRef(false);
  const uid = useId();

  useEffect(() => {
    if (!clientId || pushedRef.current || !insRef.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch {
      // AdSenseスクリプト未読み込み(ネットワーク遮断・広告ブロッカー等)でも画面自体は壊さない。
    }
  }, [clientId]);

  if (!clientId) return null;

  return (
    <div className="w-full overflow-hidden rounded-2xl bg-white/60" data-ad-container={uid}>
      <p className="px-1 pb-1 text-[9px] font-bold uppercase tracking-wider text-ink-400">{label}</p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- AdSenseの標準ins要素そのまま */}
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={clientId}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
