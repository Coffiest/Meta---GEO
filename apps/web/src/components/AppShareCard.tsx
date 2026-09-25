"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { PROD_URL, openTweetIntent, withShareTracking } from "@/lib/share";

/** アプリ自体を人に薦めるときの共有文。特定のハンド/結果ではなくアプリ紹介用。 */
const APP_SHARE_TEXT =
  "Poker ART — 無料で本格NLHトーナメントに挑戦。GEO戦略DBで結果まで検討できる本格ポーカーアプリ。";

/**
 * アプリ自体をX/Instagramで共有できるカード(出典: uiverse.io by gagan-gv)。
 *
 * 原案はボタンをホバーすると内側の黒ピル(ラベル)が引っ込み、代わりにアイコン列が
 * 現れる構造だった。ただしタッチ端末にはホバーが無く、以前 LeaveTableButton で
 * 同じ手法が「タップ後ホバー相当の状態が解除されず展開しっぱなしになる」不具合を
 * 起こしたため、ここではアイコンは常時表示のタップ対象にしている。外側の明るい面+
 * 内側の暗いピル、という色の入れ子構造だけを踏襲した。
 *
 * Instagramには任意のテキスト/URLを差し込んで投稿画面を開くWeb用のインテントが無いため、
 * navigator.share(対応端末ではInstagramも共有シートの候補に出る)を優先し、
 * 使えない環境ではリンクをクリップボードにコピーして手動で貼ってもらう。
 */
export function AppShareCard() {
  const [igCopied, setIgCopied] = useState(false);
  const shareUrl = withShareTracking(PROD_URL, "home");

  function shareToX() {
    openTweetIntent({ text: APP_SHARE_TEXT, url: shareUrl, hashtags: ["ポーカーアート", "ポーカー"] });
  }

  async function shareToInstagram() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text: APP_SHARE_TEXT, url: shareUrl });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        // 共有シートが出せない環境(権限・非セキュアコンテキスト等)はコピーへ落とす。
      }
    }
    try {
      await navigator.clipboard.writeText(`${APP_SHARE_TEXT} ${shareUrl}`);
      setIgCopied(true);
      window.setTimeout(() => setIgCopied(false), 2000);
    } catch {
      /* クリップボード不可でも致命ではない */
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-full bg-n-3 py-1.5 pl-5 pr-1.5 shadow-e1">
      <span className="text-[13px] font-bold text-fg">{igCopied ? "リンクをコピーしました" : "アプリをシェア"}</span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={shareToX}
          aria-label="Xでシェア"
          className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-n-0 text-fg"
        >
          <Icon name="logo-x" className="h-4 w-4" />
        </button>
        <button
          onClick={() => void shareToInstagram()}
          aria-label="Instagramでシェア"
          className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-n-0 text-fg"
        >
          {igCopied ? <Icon name="check" className="h-4 w-4 text-accent" /> : <Icon name="logo-instagram" className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
