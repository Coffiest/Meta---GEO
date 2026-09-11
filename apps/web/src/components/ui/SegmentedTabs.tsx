"use client";

import { motion } from "framer-motion";
import { SPRING_MOVE } from "@/lib/motion";

/**
 * ページ内のタブ切り替え(リーダーボードの期間・指標、履歴の絞り込み等)。
 *
 * 選択状態を「文字色が変わる」ではなく「面が滑ってくる」ことで示す。黒い島(`.segmented`、
 * ガラス素材)の中を、もう1枚の薄いガラス片(`.segmented-glider`)が滑る ―― ソリッドの
 * アクセント面ではなく半透明+ぼかしにすることで、島そのものと同じ「リキッドグラス」の
 * 語彙に揃えている(出典: uiverse.io by _7948の「黒い島+スライドするインジケータ」構造を、
 * Apple Musicのリキッドグラス素材へ改変)。
 *
 * 原案は radio + CSS transition だけで位置を出しているが、ジェスチャで触れる要素は
 * スプリングで動かす(CLAUDE.mdの実装のきまり)ため、ここでは Framer Motion の
 * `SPRING_MOVE` で滑らせる。項目数が画面ごとに違うため、グライダーの幅と移動量は
 * ここから比率で渡す。項目は等幅にして、`translateX(index * 100%)` だけで位置が決まる。
 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  items: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const index = Math.max(0, items.findIndex((i) => i.key === value));
  const pct = 100 / Math.max(1, items.length);

  return (
    <div role="tablist" aria-label={ariaLabel} className={`segmented ${className}`}>
      <motion.span
        aria-hidden="true"
        className="segmented-glider"
        style={{ width: `calc(${pct}% - 0.6rem * ${pct / 100})` }}
        animate={{ x: `${index * 100}%` }}
        transition={SPRING_MOVE}
      />
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={`pressable flex flex-1 items-center justify-center whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
              active ? "text-fg" : "text-fg-3"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
