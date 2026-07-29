"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const SUIT_GLYPH: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
// 差し込み済みカードデザインに合わせた4色デッキ(スペード=黒, ハート=赤, ダイヤ=青, クラブ=緑)
const SUIT_TEXT_CLASS: Record<string, string> = {
  s: "text-ink-900",
  h: "text-crimson-500",
  d: "text-azure-500",
  c: "text-mint-500",
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

function dimsFor(size: "sm" | "md" | "lg" | "xl" | "board"): string {
  // 小さい端末でも数字が読めるよう、席まわりのカードは画像の比率(744:1039)を保ったまま
  // わずかに大きくしてある。
  if (size === "sm") return "h-[43px] w-[31px] text-[10px]";
  if (size === "md") return "h-14 w-10 text-sm";
  if (size === "lg") return "h-20 w-14 text-lg";
  if (size === "xl") return "h-[72px] w-[52px] text-base";
  // ボードカード: 親セル(felt.pngの破線スロット幅に合わせた%幅)いっぱいに、カード画像
  // 本来の比率(744x1039)で描画する。枠の比率を画像と一致させることでobject-containの
  // レターボックス(=カードが枠より小さく見える問題)を無くす。
  return "w-full aspect-[744/1039] text-[9px]";
}

/**
 * `public/cards/{code}.png` (例: As.png, 10h.png, Kh.png) が存在すればそれを描画に使い、
 * 無ければ現行のCSS描画にフォールバックする。デザイン画像を後から public/cards/ に
 * 置くだけで、コード変更なしに反映される(詳細は public/cards/README.md 参照)。
 */
/**
 * 小さく描画されるカード(席まわり)で、左上にランクとスートのインデックスを重ねる。
 * カードデザインは巨大なランクが意図的に紙面からはみ出す作りのため、小さい画面では
 * どのランクなのかが読み取りにくい。この小さなインデックスが「必ず読める」保証を担う。
 */
function CardIndex({ rank, suit, size }: { rank: string; suit: string; size: "sm" | "md" | "xl" }) {
  const suitClass = SUIT_TEXT_CLASS[suit] ?? "text-ink-900";
  const scale =
    size === "sm"
      ? "px-[2px] py-[1px] text-[8px]"
      : size === "md"
        ? "px-[3px] py-[1px] text-[10px]"
        : "px-[3px] py-[1px] text-[11px]";
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute left-0 top-0 flex flex-col items-center rounded-tl-md rounded-br-[6px] bg-white font-black leading-[1.05] ${scale} ${suitClass}`}
    >
      <span>{rank}</span>
      <span className="leading-[0.9]">{SUIT_GLYPH[suit]}</span>
    </span>
  );
}

function CardFace({ card, dims, size }: { card: string; dims: string; size: "sm" | "md" | "lg" | "xl" | "board" }) {
  const [imgFailed, setImgFailed] = useState(false);
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  // 席まわりの小さなカードだけインデックスを重ねる(ボードや拡大表示は元の絵柄で十分読める)。
  const indexSize = size === "sm" || size === "md" || size === "xl" ? size : null;

  if (!imgFailed) {
    return (
      <span className="relative inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element -- 差し込みデザインは静的最適化不要な小さな画像のため素のimgでよい */}
        <img
          src={`/cards/${cardToAssetName(card)}.png`}
          alt={card}
          draggable={false}
          onError={() => setImgFailed(true)}
          className={`${dims} block rounded-md object-contain ring-1 ring-ink-950 select-none`}
        />
        {indexSize && <CardIndex rank={rank} suit={suit} size={indexSize} />}
      </span>
    );
  }

  const suitClass = SUIT_TEXT_CLASS[suit] ?? "text-ink-900";
  return (
    <div
      className={`${dims} rounded-md bg-ink-50 ring-1 ring-ink-950 flex flex-col items-center justify-center leading-none select-none`}
    >
      <span className={`font-semibold ${suitClass}`}>{rank}</span>
      <span className={suitClass}>{SUIT_GLYPH[suit]}</span>
    </div>
  );
}

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
        className={`${dims} rounded-md object-cover ring-1 ring-ink-950 select-none`}
      />
    );
  }

  return (
    <div className={`${dims} rounded-md bg-gradient-to-br from-ink-700 to-ink-800 ring-1 ring-ink-950 relative overflow-hidden`}>
      <div className="absolute inset-[3px] rounded-[5px] border border-ink-500/30" />
      <div className="absolute inset-0 flex items-center justify-center text-ink-500/50 text-[10px] tracking-widest">♠</div>
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
      {faceDown || !card ? <CardBack dims={dims} /> : <CardFace card={card} dims={dims} size={size} />}
    </motion.div>
  );
}
