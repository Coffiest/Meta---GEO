"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { HandClassCell, HandClassMatrixResult } from "@/lib/geoApi";
import { bucketColor, bucketOrderIndex } from "./colors";

/** セル内のバケット構成を、頻度順ではなく固定のアグレッション順(弱→強)で左から右に並べる。 */
function orderedBucketEntries(cell: HandClassCell): [string, number][] {
  return Object.entries(cell.byBucket).sort((a, b) => bucketOrderIndex(a[0]) - bucketOrderIndex(b[0]));
}

function cellGradient(cell: HandClassCell): string {
  if (cell.count === 0) return "#1a2942";
  const stops: string[] = [];
  let cursor = 0;
  for (const [bucket, count] of orderedBucketEntries(cell)) {
    const pct = (count / cell.count) * 100;
    if (pct <= 0) continue;
    stops.push(`${bucketColor(bucket)} ${cursor}% ${cursor + pct}%`);
    cursor += pct;
  }
  if (stops.length === 0) return "#1a2942";
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function topBucketFrequency(cell: HandClassCell): { bucket: string; pct: number } | null {
  if (cell.count === 0) return null;
  let top: [string, number] | null = null;
  for (const entry of Object.entries(cell.byBucket)) {
    if (!top || entry[1] > top[1]) top = entry;
  }
  if (!top) return null;
  return { bucket: top[0], pct: Math.round((top[1] / cell.count) * 100) };
}

interface HoverState {
  cell: HandClassCell;
  anchorX: number;
  anchorTop: number;
  anchorBottom: number;
}

/**
 * GTO Wizard型の169ハンドクラス・マトリクス。各セルは実測アクション頻度の色分け帯(アグレッション順、
 * 左=弱いアクション→右=強いアクション)で塗り、最頻出アクションの頻度%だけを数字表示する
 * (EVはソルバー未実装のため表示しない)。カーソルを合わせる/タップすると、そのハンドの詳細が
 * ふわっと浮かび上がるツールチップで表示される。
 */
export function HandClassMatrix({
  matrix,
  bucketLabels,
  onHoverCell,
}: {
  matrix: HandClassMatrixResult;
  bucketLabels: Record<string, string>;
  onHoverCell?: (cell: HandClassCell | null) => void;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);

  function showCell(cell: HandClassCell, target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    setHover({ cell, anchorX: rect.left + rect.width / 2, anchorTop: rect.top, anchorBottom: rect.bottom });
    onHoverCell?.(cell);
  }

  function hideCell() {
    setHover(null);
    onHoverCell?.(null);
  }

  const showAbove = hover ? hover.anchorTop > 180 : false;
  const tooltipX = hover ? Math.min(Math.max(hover.anchorX, 100), (typeof window !== "undefined" ? window.innerWidth : 400) - 100) : 0;

  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="grid gap-[2px] rounded-lg overflow-hidden bg-navy-950 p-[2px]"
        style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
      >
        {matrix.cells.map((row, r) =>
          row.map((cell, c) => {
            const top = topBucketFrequency(cell);
            const isHovered = hover?.cell === cell;
            return (
              <button
                key={`${r}-${c}`}
                style={{ background: cellGradient(cell) }}
                onMouseEnter={(e) => showCell(cell, e.currentTarget)}
                onFocus={(e) => showCell(cell, e.currentTarget)}
                onClick={(e) => (isHovered ? hideCell() : showCell(cell, e.currentTarget))}
                onMouseLeave={hideCell}
                onBlur={hideCell}
                className={`aspect-square flex flex-col items-center justify-center text-[8px] sm:text-[9px] font-bold text-white transition-all duration-150 focus:outline-none hover:z-10 hover:scale-110 hover:ring-1 hover:ring-white ${
                  isHovered ? "z-10 scale-110 ring-1 ring-white" : ""
                }`}
                title={`${cell.label}: ${cell.count} サンプル`}
              >
                <span className="drop-shadow">{cell.label}</span>
                {top && <span className="text-[7px] sm:text-[8px] font-semibold opacity-90">{top.pct}%</span>}
              </button>
            );
          }),
        )}
      </motion.div>

      <AnimatePresence>
        {hover && hover.cell.count > 0 && (
          <motion.div
            key={hover.cell.label}
            initial={{ opacity: 0, scale: 0.85, y: showAbove ? 8 : -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
              position: "fixed",
              left: tooltipX,
              [showAbove ? "bottom" : "top"]: showAbove
                ? (typeof window !== "undefined" ? window.innerHeight : 800) - hover.anchorTop + 8
                : hover.anchorBottom + 8,
              transform: "translateX(-50%)",
            }}
            className="z-50 pointer-events-none w-64 rounded-2xl bg-navy-900 ring-1 ring-navy-600 shadow-panel p-3.5"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-black text-navy-50">{hover.cell.label}</span>
              <span className="text-[10px] text-navy-500 tabular-nums">{hover.cell.count}件</span>
            </div>
            <div className="space-y-1.5">
              {orderedBucketEntries(hover.cell)
                .slice()
                .reverse()
                .map(([bucket, count]) => {
                  const pct = Math.round((count / hover.cell.count) * 100);
                  return (
                    <div key={bucket} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-[10px] font-semibold truncate" style={{ color: bucketColor(bucket) }}>
                        {bucketLabels[bucket] ?? bucket}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-navy-800 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{ background: bucketColor(bucket) }}
                        />
                      </div>
                      <span className="w-9 shrink-0 text-right text-[10px] font-bold text-navy-200 tabular-nums">{pct}%</span>
                    </div>
                  );
                })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="h-9 mt-2 text-[11px] text-navy-300 flex items-center">
        {!hover && <span className="text-navy-500">セルにカーソルを合わせる(タップする)と頻度の内訳が表示されます</span>}
        {hover && hover.cell.count === 0 && <span className="text-navy-500">{hover.cell.label} — サンプルなし</span>}
      </div>
    </div>
  );
}
