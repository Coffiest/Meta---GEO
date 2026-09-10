"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const SUIT_GLYPH: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
// 差し込み済みカードデザインに合わせた4色デッキ(スペード=黒, ハート=赤, ダイヤ=青, クラブ=緑)
const SUIT_TEXT_CLASS: Record<string, string> = {
  s: "text-fg",
  h: "text-crimson-300",
  d: "text-azure-400",
  c: "text-mint-400",
};

/**
 * エンジンの表記("As" "10h" "Kd" 等、ランクはA/K/Q/J/2-10)を、差し込み済みデザイン
 * アセットのファイル名規則(`public/cards/{1-13}{suit}.png`、1=A, 11=J, 12=Q, 13=K)に変換する。
 */
function cardToAssetName(card: string): string {
  const suit = card.slice(-1);
  const rankStr = card.slice(0, -1);
  const rankNum = rankStr === "A" ? 1 : rankStr === "K" ? 13 : rankStr === "Q" ? 12 : rankStr === "J" ? 11 : rankStr;
  return `${rankNum}${suit}`;
}

/* カード画像の実寸。表と裏で比率が違うので、枠は面ごとに自分の比率を持つ。
   以前は両方を表面基準の固定 w×h に押し込んでいて、裏面だけ object-cover で
   **左右が切り落とされていた**。 */
const FACE_ASPECT = "aspect-[744/1039]"; // public/cards/{1-13}{suit}.png
const BACK_ASPECT = "aspect-[1108/1477]"; // public/cards/back.png

/**
 * 高さと文字サイズだけを決める。幅は面ごとの `aspect-[…]` から決まるので指定しない
 * ―― 幅を固定すると、比率の違う画像がレターボックスされるか切り抜かれるかのどちらかになる。
 * 高さを揃えてあるので、表裏が混ざって並んでも行の高さは崩れない。
 */
function dimsFor(size: "sm" | "md" | "lg" | "xl" | "board"): string {
  // 小さい端末でも数字が読めるよう、席まわりのカードはわずかに大きくしてある。
  if (size === "sm") return "h-[43px] text-[10px]";
  if (size === "md") return "h-14 text-sm";
  if (size === "lg") return "h-20 text-lg";
  if (size === "xl") return "h-[72px] text-base";
  // ボードカード: 親セル(卓画像の破線スロット幅に合わせた%幅)いっぱいに描く。
  // ここだけは幅が主で高さが従になるので、高さは指定しない。
  return "w-full text-[9px]";
}

/**
 * `public/cards/{code}.png` (例: As.png, 10h.png, Kh.png) が存在すればそれを描画に使い、
 * 無ければ現行のCSS描画にフォールバックする。デザイン画像を後から public/cards/ に
 * 置くだけで、コード変更なしに反映される(詳細は public/cards/README.md 参照)。
 */
function CardFace({ card, dims }: { card: string; dims: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);

  if (!imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 差し込みデザインは静的最適化不要な小さな画像のため素のimgでよい
      <img
        src={`/cards/${cardToAssetName(card)}.png`}
        alt={card}
        draggable={false}
        onError={() => setImgFailed(true)}
        className={`${dims} ${FACE_ASPECT} block select-none rounded-md object-contain shadow-e1 ring-1 ring-black/40`}
      />
    );
  }

  const suitClass = SUIT_TEXT_CLASS[suit] ?? "text-fg";
  return (
    <div
      className={`${dims} ${FACE_ASPECT} rounded-md bg-canvas ring-1 ring-line-strong flex flex-col items-center justify-center leading-none select-none`}
    >
      <span className={`font-semibold ${suitClass}`}>{rank}</span>
      <span className={suitClass}>{SUIT_GLYPH[suit]}</span>
    </div>
  );
}

/**
 * 伏せカード。
 *
 * 読んでいる画像は今まで通り `/table/bg-pattern.jpeg`(1108×1477)。`public/cards/back.png` も
 * 同じ寸法で置いてあるが**別の絵**(明るいグレー)なので、勝手に差し替えない ―― 直すのは
 * 切り抜きだけ、という指示のため。
 *
 * 直したのは `object-cover` だったこと。枠が表面基準の比率(744:1039)で、裏面(1108:1477)は
 * それより横長なので、cover で高さに合わせると**左右が切り落とされていた**。
 * 枠に裏面自身の比率を持たせ、object-contain にしてある(比率が一致するので余白も出ない)。
 */
function CardBack({ dims }: { dims: string }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (!imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/table/bg-pattern.jpeg"
        alt=""
        draggable={false}
        onError={() => setImgFailed(true)}
        className={`${dims} ${BACK_ASPECT} select-none rounded-md object-contain shadow-e1 ring-1 ring-black/40`}
      />
    );
  }

  return (
    <div className={`${dims} ${BACK_ASPECT} rounded-md bg-gradient-to-br from-n-5 to-n-5 ring-1 ring-line-strong relative overflow-hidden`}>
      <div className="absolute inset-[3px] rounded-[5px] border border-n-5/30" />
      <div className="absolute inset-0 flex items-center justify-center text-fg-2/50 text-[10px] tracking-widest">♠</div>
    </div>
  );
}

export function PlayingCard({
  card,
  size = "md",
  faceDown = false,
  dealDelay = 0,
}: {
  card?: string;
  size?: "sm" | "md" | "lg" | "xl" | "board";
  faceDown?: boolean;
  dealDelay?: number;
}) {
  const dims = dimsFor(size);

  return (
    <motion.div
      className={size === "board" ? "w-full" : "shrink-0"}
      initial={{ opacity: 0, y: -8, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: dealDelay, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      {faceDown || !card ? <CardBack dims={dims} /> : <CardFace card={card} dims={dims} />}
    </motion.div>
  );
}
