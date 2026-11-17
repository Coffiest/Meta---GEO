"use client";

import { motion } from "framer-motion";
import { SPRING_SNAPPY } from "@/lib/motion";
import { bucketOrderIndex } from "./colors";
import { mergeOpenRaiseOptions, type ActionOption } from "@/lib/geoApi";
import { Icon } from "../Icon";

export type Street = "preflop" | "flop" | "turn" | "river";
export type PostflopStreet = "flop" | "turn" | "river";

export interface PositionPillItem {
  kind: "position";
  street: Street;
  position: string;
  state: "decided" | "active" | "future";
  actionLabel?: string;
  bucket?: string;
  geometricRatio?: number;
  /** ライン内でのインデックス。decided状態のときのみ存在し、タップで巻き戻すのに使う。 */
  lineIndex?: number;
  /** まだ手番の来ていない席のうち、押すと手前の席を全員フォールドにしてそこまで進める席(プリフロップ)。 */
  jumpable?: boolean;
}

export interface StreetMarkerItem {
  kind: "street";
  street: PostflopStreet;
  cards: string[];
}

export type PillBarItem = PositionPillItem | StreetMarkerItem;

const STREET_LABEL: Record<PostflopStreet, string> = { flop: "FLOP", turn: "TURN", river: "RIVER" };

function suitSymbol(card: string): string {
  const s = card.slice(-1);
  return s === "s" ? "♠" : s === "h" ? "♥" : s === "d" ? "♦" : "♣";
}
function suitTextClass(card: string): string {
  if (card.endsWith("h")) return "text-crimson-300";
  if (card.endsWith("d")) return "text-azure-400";
  if (card.endsWith("c")) return "text-mint-400";
  return "text-fg";
}

/**
 * GTO Wizard型の横スクロール式ポジションバー。プリフロップの全ポジション+
 * (進行していれば)FLOP/TURN/RIVERのマーカーとその後のポジション、を1本の連続した
 * タイムラインとして表示する。決定済みのピルはタップでその地点まで巻き戻せる。
 * 手番中(state === "active")のピルは、GTO Wizardの画面そのままに、そのピル自体の中に
 * Fold/Raise.../Allinを縦に並べて直接タップ選択できる(別パネルを開く一段を挟まない)。
 */
export function PositionPillBar({
  items,
  onTruncate,
  onJump,
  activeOptions,
  activeSampleSize,
  bucketLabels,
  onSelect,
}: {
  items: PillBarItem[];
  onTruncate: (street: Street, lineIndex: number) => void;
  /** まだ手番の来ていない席を押したとき(手前の席を全員フォールドにしてそこまで進める)。 */
  onJump?: (position: string) => void;
  /** 手番中ポジションの選択肢。無ければそのピルは「選択中」表示のみ(サンプルなし等)。 */
  activeOptions?: ActionOption[];
  activeSampleSize?: number;
  bucketLabels?: Record<string, string>;
  onSelect?: (bucket: string) => void;
}) {
  const sortedActiveOptions = activeOptions
    ? mergeOpenRaiseOptions(activeOptions).sort((a, b) => bucketOrderIndex(b.bucket) - bucketOrderIndex(a.bucket))
    : [];
  return (
    // 横にスクロールするカードの列。端は固い線で切らず、左 8px・右 12px かけて消す(左は内側に 8px 空けて、先頭のカードは消さない)(スクロールの端の効果)。
    // 以前は左端でカードが途中でぶつ切りになり(「old」「N Raise」のように見える)、壊れて見えた。
    <div
      className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto no-scrollbar rounded-xl bg-[#1b1b1d] p-1"
    >
      {items.map((item, i) =>
        item.kind === "street" ? (
          <motion.div
            key={`street-${i}`}
            layout
            initial={{ opacity: 0, scale: 0.9, x: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={SPRING_SNAPPY}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-[#252528] px-2.5 py-1.5"
          >
            <span className="text-[9px] font-black tracking-widest text-accent">{STREET_LABEL[item.street]}</span>
            <div className="flex gap-0.5">
              {item.cards.map((c) => (
                <motion.div
                  key={c}
                  initial={{ opacity: 0, rotateY: 90 }}
                  animate={{ opacity: 1, rotateY: 0 }}
                  transition={{ duration: 0.3 }}
                  /* ガラスの上にガラスは重ねない(可読性が破綻する)。カード面は不透明にする。 */
                  className="flex h-7 w-5 flex-col items-center justify-center rounded-sm bg-surface text-[8px] font-bold leading-none ring-1 ring-inset ring-line"
                >
                  <span className={suitTextClass(c)}>{c.slice(0, -1)}</span>
                  <span className={suitTextClass(c)}>{suitSymbol(c)}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : item.state === "active" ? (
          <motion.div
            key={`${item.street}-${item.position}-${i}`}
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={SPRING_SNAPPY}
            className="shrink-0 overflow-hidden rounded-lg bg-[#252528] ring-2 ring-[#8fe388] min-w-[96px]"
          >
            <div className="px-2 pt-1.5 pb-1 text-[13px] font-black text-[#8fe388]">{item.position}</div>
            {sortedActiveOptions.length === 0 ? (
              <div className="px-2.5 pb-1.5 text-[11px] font-medium text-fg-3">
                {activeSampleSize === 0 ? "サンプルなし" : "…"}
              </div>
            ) : (
              <div className="flex flex-col">
                {sortedActiveOptions.map((opt) => (
                  <button
                    key={opt.bucket}
                    onClick={() => onSelect?.(opt.representativeBucket ?? opt.bucket)}
                    className="pressable px-2 py-0.5 text-left text-[13px] leading-[1.45] text-[#e6e6e6] truncate hover:text-white"
                  >
                    {bucketLabels?.[opt.bucket] ?? opt.bucket}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.button
            key={`${item.street}-${item.position}-${i}`}
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            whileTap={item.lineIndex !== undefined || item.jumpable ? { scale: 0.94 } : undefined}
            transition={SPRING_SNAPPY}
            disabled={item.state === "future" && !(item.jumpable && onJump)}
            onClick={() => {
              if (item.lineIndex !== undefined) onTruncate(item.street, item.lineIndex);
              else if (item.jumpable) onJump?.(item.position);
            }}
            aria-label={item.jumpable ? `${item.position}まで進める(手前の席はフォールド)` : undefined}
            className={`shrink-0 rounded-lg bg-[#252528] px-2 py-1.5 text-left min-w-[80px] ${
              item.state === "decided" ? "" : item.jumpable ? "" : "opacity-40"
            }`}
          >
            <div className="mb-1 text-[13px] font-black text-[#cfcfcf]">{item.position}</div>
            {item.state === "decided" ? (
              <div className="max-w-[110px] truncate text-[13px] font-bold text-white">{item.actionLabel}</div>
            ) : item.jumpable ? (
              // 押せることが分かるように、手前を飛ばしてここへ進めることを短く書く。
              <div className="flex items-center gap-0.5 text-[13px] text-[#8a8a8a]">
                ここへ
                <Icon name="chevron-right" className="h-3 w-3" />
              </div>
            ) : (
              <div className="text-[13px] text-[#8a8a8a]">—</div>
            )}
          </motion.button>
        ),
      )}
    </div>
  );
}
