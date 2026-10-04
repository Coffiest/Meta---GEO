"use client";

import { AdSlot } from "@/components/AdSlot";

/**
 * コンテンツページ用の広告枠。十分なオリジナル本文があるページ(遊び方・戦略・用語集)に「のみ」置く
 * ―― パブリッシャーのコンテンツを含まない/薄い画面に広告を出さないため。
 * 広告ユニット未作成の間は AdSlot 自体が何も描画しない。
 */
export function ContentAd() {
  return (
    <div className="my-8">
      <AdSlot placement="content" label="スポンサーリンク" />
    </div>
  );
}
