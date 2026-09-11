"use client";

import { AdSlot } from "@/components/AdSlot";

/**
 * コンテンツページ用の広告枠。十分なオリジナル本文があるページ(遊び方・戦略・用語集)に「のみ」置く。
 * `NEXT_PUBLIC_ADSENSE_CONTENT_SLOT_ID` が未設定の間は AdSlot 自体が何も描画しない
 * (パブリッシャーのコンテンツを含まない/薄い画面に広告を出さないための二重の安全策)。
 */
const CONTENT_SLOT = process.env["NEXT_PUBLIC_ADSENSE_CONTENT_SLOT_ID"];

export function ContentAd() {
  if (!CONTENT_SLOT) return null;
  return (
    <div className="my-8">
      <AdSlot slot={CONTENT_SLOT} label="スポンサーリンク" />
    </div>
  );
}
