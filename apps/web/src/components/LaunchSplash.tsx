"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isEmbedded } from "@/lib/embedSession";

/**
 * アプリを起動した瞬間の画面(スプラッシュ)。iOS のネイティブアプリの起動演出と同じく、
 * アイコンのタイルが現れて光り、ワードマークが並び、そのままアプリへ抜けていく。
 *
 * ## なぜ CSS のキーフレームで動かすのか
 *
 * このアプリの動きは原則スプリング(`motion.ts`)だが、スプラッシュは**JSが読み込まれる前の
 * 最初の描画**から動いていないと意味が無い(JSを待つと、その間は真っ暗な画面になる)。
 * サーバーのHTMLだけで最初から最後まで動くよう、出現から退場まで全て CSS のキーフレームで書く
 * (`globals.css` の「起動画面」)。触って動かすものではないので、途中で掴めないことは問題にならない。
 * JS は、読み込まれたら (1) 終わった画面をDOMから外す (2) タップで早送りする、の2つだけを受け持つ。
 * JS が来なくても、CSS だけで消えて操作を妨げない(最後に visibility: hidden になる)。
 *
 * ## 出す場所
 *
 * - アプリ本体(`/`)を開いたときだけ。ガイドやLPなどの読み物のページには出さない。
 * - 埋め込み(`?embed=1`)では出さない。スプラッシュの直後の同期スクリプトで、最初の描画から隠す
 *   (`<html>` に印を付ける方式は、ハイドレーションで属性が消されて効かなかった)。
 * - `layout.tsx` に置くので、画面遷移(クライアント側のナビゲーション)では出ない。起動1回につき1回。
 */

/**
 * 念のための上限(ms)。通常は退場のアニメーションの終わり(animationend)で外す。
 * アニメーションが動かない環境でも、これを過ぎたら必ず外す。
 */
const SPLASH_FALLBACK_MS = 5000;

const WORD = ["P", "o", "k", "e", "r", " ", "A", "R", "T"];

export function LaunchSplash() {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    if (isEmbedded()) {
      setGone(true);
      return;
    }
    // JS の読み込みが遅く、CSS の演出がもう終わっていたら(最後に visibility: hidden になる)すぐ外す。
    // 時間を JS 側で数えないのは、アニメーションの起点(最初の描画)と JS の時計の起点がずれ、
    // 退場のフェードの途中で切れてしまうため。
    const el = ref.current;
    if (!el || getComputedStyle(el).visibility === "hidden") {
      setGone(true);
      return;
    }
    const t = window.setTimeout(() => setGone(true), SPLASH_FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (gone || pathname !== "/") return null;

  return (
    <>
      <div
        ref={ref}
        id="launch-splash"
        className={`launch-splash ${skipping ? "launch-splash-skip" : ""}`}
        // 埋め込み表示では直後の script が描画前に style="display:none" を付ける。サーバーの HTML と属性が
        // 食い違うのは意図どおりなので、ハイドレーションの不一致として扱わない(扱うと画面全体が作り直される)。
        suppressHydrationWarning
        aria-hidden="true"
        // 触れた瞬間に早送りする(離すのを待たない)。
        onPointerDown={() => setSkipping(true)}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && (e.animationName === "splash-out" || e.animationName === "splash-skip")) {
            setGone(true);
          }
        }}
      >
        <div className="launch-splash-stage">
          <div className="launch-splash-bloom" />
          <div className="launch-splash-ring" />
          <div className="launch-splash-icon">
            {/* eslint-disable-next-line @next/next/no-img-element -- JSより前の最初の描画で出すため、素の img で読む */}
            <img src="/logos/Logo_club_mark_256.png" alt="" width={120} height={120} fetchPriority="high" draggable={false} />
          </div>
          <p className="launch-splash-word">
            {WORD.map((ch, i) => (
              <span
                key={i}
                className={i >= 6 ? "text-accent" : undefined}
                style={{ ["--i" as string]: i }}
              >
                {ch === " " ? " " : ch}
              </span>
            ))}
          </p>
        </div>
      </div>
      {/* 埋め込みでは出さない。直後に同期で実行されるので、最初の描画から隠れる。 */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "if(new URLSearchParams(location.search).get('embed')==='1'){var s=document.getElementById('launch-splash');if(s)s.style.display='none';}",
        }}
      />
    </>
  );
}
