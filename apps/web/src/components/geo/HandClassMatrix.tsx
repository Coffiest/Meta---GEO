"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { mergeOpenRaiseByBucket, OPEN_RAISE_BUCKET, type HandClassCell, type HandClassMatrixResult } from "@/lib/geoApi";
import { bucketColor, bucketOrderIndex } from "./colors";

/**
 * 表示用に加工したセル。mergeOpenRaiseが有効な場合、raise2-5/raise5+/allInの3バケットを
 * Open Raise 1つへ統合する(PositionPillBar/PositionActionRowと表示を揃えるため)。
 * openRaiseRepresentativeは、統合後の「openRaise」バケットの色を決めるための、
 * 統合前の実バケットのうち最多件数だったもの。
 */
interface DisplayCell extends HandClassCell {
  openRaiseRepresentative?: string;
}

function toDisplayCell(cell: HandClassCell, mergeOpenRaise: boolean): DisplayCell {
  if (!mergeOpenRaise) return cell;
  const merged = mergeOpenRaiseByBucket(cell.byBucket);
  if (!merged.openRaiseRepresentative) return cell;
  return { ...cell, byBucket: merged.byBucket, openRaiseRepresentative: merged.openRaiseRepresentative };
}

/** 統合後の「openRaise」バケットは単体では色を持たないため、統合前の代表バケットへ解決する。 */
function colorForBucket(cell: DisplayCell, bucket: string): string {
  return bucketColor(bucket === OPEN_RAISE_BUCKET ? (cell.openRaiseRepresentative ?? bucket) : bucket);
}

/** セル内のバケット構成を、頻度順ではなく固定のアグレッション順(強→弱)で左から右に並べる(濃い色=強いアクションが常に左)。 */
function orderedBucketEntries(cell: HandClassCell): [string, number][] {
  return Object.entries(cell.byBucket).sort((a, b) => bucketOrderIndex(b[0]) - bucketOrderIndex(a[0]));
}

function cellGradient(cell: DisplayCell): string {
  if (cell.count === 0) return "#232326";
  const stops: string[] = [];
  let cursor = 0;
  for (const [bucket, count] of orderedBucketEntries(cell)) {
    const pct = (count / cell.count) * 100;
    if (pct <= 0) continue;
    stops.push(`${colorForBucket(cell, bucket)} ${cursor}% ${cursor + pct}%`);
    cursor += pct;
  }
  if (stops.length === 0) return "#232326";
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
  /** 表示用(Open Raise統合後)のセル。ツールチップの描画に使う。 */
  cell: DisplayCell;
  /** matrix.cells由来の元セル参照。toDisplayCellは毎レンダー新しいオブジェクトを作るため、
      「今どのセルがホバー中か」の同一性判定はこちらで行う。 */
  rawCell: HandClassCell;
  anchorX: number;
  anchorTop: number;
  anchorBottom: number;
}

/** ツールチップ(w-64=256px)の半幅+画面端との余白。マージンが半幅未満だと、画面端付近の
 * セルをタップしたときにツールチップの反対側が画面からはみ出て見切れる(実際に起きていた不具合)。 */
const TOOLTIP_HALF_WIDTH = 128;
const TOOLTIP_EDGE_GUTTER = 12;
const TOOLTIP_MARGIN = TOOLTIP_HALF_WIDTH + TOOLTIP_EDGE_GUTTER;

/**
 * GTO Wizard型の169ハンドクラス・マトリクス。各セルは実測アクション頻度の色分け帯(アグレッション順、
 * 左=強いアクション(濃い色)→右=弱いアクション(薄い色、Foldは常に右端))で塗り、
 * 最頻出アクションの頻度%だけを数字表示する
 * (EVはソルバー未実装のため表示しない)。カーソルを合わせる/タップすると、そのハンドの詳細が
 * ふわっと浮かび上がるツールチップで表示される。
 */
export function HandClassMatrix({
  matrix,
  bucketLabels,
  mergeOpenRaise = false,
  onHoverCell,
}: {
  matrix: HandClassMatrixResult;
  bucketLabels: Record<string, string>;
  /** プリフロップのみtrue: raise2-5/raise5+/allInを表示上「Open Raise」1つへ統合する。 */
  mergeOpenRaise?: boolean;
  onHoverCell?: (cell: HandClassCell | null) => void;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);

  function showCell(cell: DisplayCell, rawCell: HandClassCell, target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    setHover({ cell, rawCell, anchorX: rect.left + rect.width / 2, anchorTop: rect.top, anchorBottom: rect.bottom });
    onHoverCell?.(rawCell);
  }

  function hideCell() {
    setHover(null);
    onHoverCell?.(null);
  }

  const showAbove = hover ? hover.anchorTop > 180 : false;
  const tooltipX = hover
    ? Math.min(
        Math.max(hover.anchorX, TOOLTIP_MARGIN),
        (typeof window !== "undefined" ? window.innerWidth : 400) - TOOLTIP_MARGIN,
      )
    : 0;

  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="grid gap-[2px] rounded-lg overflow-hidden bg-canvas-sunken p-[2px]"
        style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
      >
        {matrix.cells.map((row, r) =>
          row.map((cell, c) => {
            const displayCell = toDisplayCell(cell, mergeOpenRaise);
            const top = topBucketFrequency(displayCell);
            const isHovered = hover?.rawCell === cell;
            return (
              <button
                key={`${r}-${c}`}
                style={{ background: cellGradient(displayCell) }}
                onMouseEnter={(e) => showCell(displayCell, cell, e.currentTarget)}
                onFocus={(e) => showCell(displayCell, cell, e.currentTarget)}
                onClick={(e) => (isHovered ? hideCell() : showCell(displayCell, cell, e.currentTarget))}
                onMouseLeave={hideCell}
                onBlur={hideCell}
                className={`pressable aspect-square flex flex-col items-center justify-center text-[8px] sm:text-[9px] lg:text-[11px] font-bold text-white transition-all duration-150 focus:outline-none hover:z-10 hover:scale-110 hover:ring-1 hover:ring-white ${
                  isHovered ? "z-10 scale-110 ring-1 ring-white" : ""
                }`}
                title={`${cell.label}: ${cell.count} サンプル`}
              >
                {/* セルは複数のアクション色が横に並ぶ帯なので、文字の下だけ色を選ぶことができない。
                    代わりに暗いハローを敷いて、どの帯の上でも白文字が読めるようにする。 */}
                <span style={{ textShadow: "0 1px 2px rgb(0 0 0 / 0.9), 0 0 3px rgb(0 0 0 / 0.7)" }}>{cell.label}</span>
                {top && <span className="text-[7px] font-semibold opacity-90 sm:text-[8px] lg:text-[10px]" style={{ textShadow: "0 1px 2px rgb(0 0 0 / 0.9)" }}>
                    {top.pct}%
                  </span>}
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
            className="z-50 pointer-events-none w-64 rounded-2xl glass-panel shadow-e2 p-3.5"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-black text-fg">{hover.cell.label}</span>
              <span className="text-[10px] text-fg-3 tabular-nums">{hover.cell.count}件</span>
            </div>
            <div className="space-y-1.5">
              {orderedBucketEntries(hover.cell)
                .map(([bucket, count]) => {
                  const pct = Math.round((count / hover.cell.count) * 100);
                  return (
                    <div key={bucket} className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorForBucket(hover.cell, bucket) }} />
                      <span className="w-[74px] shrink-0 text-[10px] font-bold text-white truncate">
                        {bucketLabels[bucket] ?? bucket}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{ background: colorForBucket(hover.cell, bucket) }}
                        />
                      </div>
                      <span className="w-9 shrink-0 text-right text-[10px] font-bold text-n-10 tabular-nums">{pct}%</span>
                    </div>
                  );
                })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="h-9 mt-2 text-[11px] text-n-9 flex items-center font-mono">
        {!hover && <span className="text-fg-3">{"// "}セルにカーソルを合わせる(タップする)と頻度の内訳が表示されます</span>}
        {hover && hover.cell.count === 0 && <span className="text-fg-3">{"// "}{hover.cell.label} — サンプルなし</span>}
      </div>
    </div>
  );
}
