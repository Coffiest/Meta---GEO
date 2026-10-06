"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isEmbedded } from "@/lib/embedSession";
import { ParticleText } from "./effects/ParticleText";

/**
 * アプリを起動した瞬間の画面(スプラッシュ)。粒子が集まって「Poker ART」の文字になる
 * (以前はログイン画面の見出しの上にあった演出。オーナー指示で起動画面へ移し、旧来のアイコンの演出は削除)。
 *
 * ## 動きの受け持ち
 *
 * - 地(暗い背景)はサーバーの HTML で最初の描画から出す。粒子は canvas なので JS の読み込み後に始まる。
 * - 退場は JS が合図する: 粒子が集まりきって(`GATHER_MS`)少し見せたら(`HOLD_MS`)`launch-splash-exit` を付ける。
 * - JS が来なくても、CSS だけで一定時間後に必ず消えて操作を妨げない(最後に visibility: hidden になる)。
 * - 触れた瞬間に早送りする(離すのを待たない)。
 * - ParticleText は rAF を回し続けるので、消えたら DOM から外して止める。
 *
 * ## 出す場所
 *
 * - アプリ本体(`/`)を開いたときだけ。ガイドやLPなどの読み物のページには出さない。
 * - 埋め込み(`?embed=1`)では出さない。スプラッシュの直後の同期スクリプトで、最初の描画から隠す
 *   (`<html>` に印を付ける方式は、ハイドレーションで属性が消されて効かなかった)。
 * - `layout.tsx` に置くので、画面遷移(クライアント側のナビゲーション)では出ない。起動1回につき1回。
 */

/** ParticleText の集まり終わり(gatherDuration 1600 + stagger 420)。 */
const GATHER_MS = 2020;
/** 集まった文字を見せておく時間。 */
const HOLD_MS = 450;
/** 念のための上限(ms)。退場のアニメーションが動かない環境でも、これを過ぎたら必ず外す。 */
const SPLASH_FALLBACK_MS = 7000;

export function LaunchSplash() {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    if (isEmbedded()) {
      setGone(true);
      return;
    }
    // JS の読み込みが遅く、CSS の上限でもう消えていたら(visibility: hidden)すぐ外す。
    const el = ref.current;
    if (!el || getComputedStyle(el).visibility === "hidden") {
      setGone(true);
      return;
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const exitTimer = window.setTimeout(() => setExiting(true), reduce ? 900 : GATHER_MS + HOLD_MS);
    const fallback = window.setTimeout(() => setGone(true), SPLASH_FALLBACK_MS);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(fallback);
    };
  }, []);

  if (gone || pathname !== "/") return null;

  return (
    <>
      <div
        ref={ref}
        id="launch-splash"
        className={`launch-splash ${skipping ? "launch-splash-skip" : exiting ? "launch-splash-exit" : ""}`}
        // 埋め込み表示では直後の script が描画前に style="display:none" を付ける。サーバーの HTML と属性が
        // 食い違うのは意図どおりなので、ハイドレーションの不一致として扱わない(扱うと画面全体が作り直される)。
        suppressHydrationWarning
        aria-hidden="true"
        onPointerDown={() => setSkipping(true)}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && e.animationName === "splash-out") setGone(true);
        }}
      >
        <div className="launch-splash-stage">
          <ParticleText text="Poker ART" fontSize="clamp(2.6rem, 13vw, 4.5rem)" fontWeight={800} density={3} pointerRepel={0} />
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
