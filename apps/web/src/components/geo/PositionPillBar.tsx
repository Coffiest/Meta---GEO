"use client";

import { motion } from "framer-motion";
import { bucketColor, bucketOrderIndex } from "./colors";
import type { ActionOption } from "@/lib/geoApi";

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
  if (card.endsWith("h")) return "text-crimson-500";
  if (card.endsWith("d")) return "text-azure-500";
  if (card.endsWith("c")) return "text-mint-500";
  return "text-navy-950";
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
  activeOptions,
  activeSampleSize,
  bucketLabels,
  onSelect,
}: {
  items: PillBarItem[];
  onTruncate: (street: Street, lineIndex: number) => void;
  /** 手番中ポジションの選択肢。無ければそのピルは「選択中」表示のみ(サンプルなし等)。 */
  activeOptions?: ActionOption[];
  activeSampleSize?: number;
  bucketLabels?: Record<string, string>;
  onSelect?: (bucket: string) => void;
}) {
  const sortedActiveOptions = activeOptions
    ? [...activeOptions].sort((a, b) => bucketOrderIndex(b.bucket) - bucketOrderIndex(a.bucket))
    : [];
  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto no-scrollbar">
      {items.map((item, i) =>
        item.kind === "street" ? (
          <motion.div
            key={`street-${i}`}
            layout
            initial={{ opacity: 0, scale: 0.9, x: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            className="shrink-0 flex items-center gap-1.5 rounded-xl bg-navy-900 ring-1 ring-navy-700 px-2.5 py-1.5"
          >
            <span className="text-[9px] font-bold tracking-widest text-gold-500">{STREET_LABEL[item.street]}</span>
            <div className="flex gap-0.5">
              {item.cards.map((c) => (
                <motion.div
                  key={c}
                  initial={{ opacity: 0, rotateY: 90 }}
                  animate={{ opacity: 1, rotateY: 0 }}
                  transition={{ duration: 0.3 }}
                  className="h-7 w-5 rounded-sm bg-navy-50 flex flex-col items-center justify-center text-[8px] font-bold leading-none"
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
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
            className="shrink-0 rounded-xl bg-navy-900 ring-2 ring-gold-500 overflow-hidden min-w-[90px]"
          >
            <div className="px-2.5 pt-1.5 pb-1 text-[9px] font-bold tracking-wide text-gold-400">{item.position}</div>
            {sortedActiveOptions.length === 0 ? (
              <div className="px-2.5 pb-1.5 text-[11px] font-medium text-navy-500">
                {activeSampleSize === 0 ? "サンプルなし" : "…"}
              </div>
            ) : (
              <div className="flex flex-col">
                {sortedActiveOptions.map((opt) => (
                  <button
                    key={opt.bucket}
                    onClick={() => onSelect?.(opt.bucket)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-left text-[12px] font-bold text-white truncate hover:bg-navy-800 active:bg-navy-700"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: bucketColor(opt.bucket, opt.geometricRatio) }}
                    />
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
            whileTap={item.lineIndex !== undefined ? { scale: 0.94 } : undefined}
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
            disabled={item.state === "future"}
            onClick={() => item.lineIndex !== undefined && onTruncate(item.street, item.lineIndex)}
            className={`shrink-0 rounded-xl px-2.5 py-1.5 text-left min-w-[64px] ${
              item.state === "decided"
                ? "bg-navy-900 ring-1 ring-navy-600/60"
                : "bg-navy-950 ring-1 ring-navy-800 opacity-50"
            }`}
          >
            <div className="text-[9px] font-bold tracking-wide text-navy-400">{item.position}</div>
            {item.state === "decided" ? (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-white truncate max-w-[90px]">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: bucketColor(item.bucket ?? "", item.geometricRatio) }}
                />
                {item.actionLabel}
              </div>
            ) : (
              <div className="text-[11px] font-medium text-navy-500">—</div>
            )}
          </motion.button>
        ),
      )}
    </div>
  );
}
