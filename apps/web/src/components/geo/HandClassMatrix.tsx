"use client";

import { useState } from "react";
import type { HandClassCell, HandClassMatrixResult } from "@/lib/geoApi";
import { bucketColor } from "./colors";

function cellGradient(cell: HandClassCell): string {
  if (cell.count === 0) return "#1a2942";
  const entries = Object.entries(cell.byBucket);
  const stops: string[] = [];
  let cursor = 0;
  for (const [bucket, count] of entries) {
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

/**
 * GTO Wizard型の169ハンドクラス・マトリクス。各セルは実測アクション頻度の色分け帯で塗り、
 * 最頻出アクションの頻度%だけを数字表示する(EVはソルバー未実装のため表示しない)。
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
  const [selected, setSelected] = useState<HandClassCell | null>(null);

  return (
    <div>
      <div
        className="grid gap-[2px] rounded-lg overflow-hidden bg-navy-950 p-[2px]"
        style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
      >
        {matrix.cells.map((row, r) =>
          row.map((cell, c) => {
            const top = topBucketFrequency(cell);
            return (
              <button
                key={`${r}-${c}`}
                style={{ background: cellGradient(cell) }}
                onMouseEnter={() => {
                  setSelected(cell);
                  onHoverCell?.(cell);
                }}
                onFocus={() => {
                  setSelected(cell);
                  onHoverCell?.(cell);
                }}
                onMouseLeave={() => {
                  setSelected(null);
                  onHoverCell?.(null);
                }}
                onBlur={() => {
                  setSelected(null);
                  onHoverCell?.(null);
                }}
                className="aspect-square flex flex-col items-center justify-center text-[8px] sm:text-[9px] font-bold text-white transition-transform focus:outline-none hover:z-10 hover:scale-110 hover:ring-1 hover:ring-white"
                title={`${cell.label}: ${cell.count} サンプル`}
              >
                <span className="drop-shadow">{cell.label}</span>
                {top && <span className="text-[7px] sm:text-[8px] font-semibold opacity-90">{top.pct}%</span>}
              </button>
            );
          }),
        )}
      </div>

      <div className="h-9 mt-2 text-[11px] text-navy-300 flex items-center">
        {selected ? (
          selected.count === 0 ? (
            <span className="text-navy-500">{selected.label} — サンプルなし</span>
          ) : (
            <span className="flex items-center gap-3 flex-wrap">
              <span className="text-navy-100 font-semibold">{selected.label}</span>
              {Object.entries(selected.byBucket)
                .sort((a, b) => b[1] - a[1])
                .map(([bucket, count]) => (
                  <span key={bucket} className="flex items-center gap-1" style={{ color: bucketColor(bucket) }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: bucketColor(bucket) }} />
                    {bucketLabels[bucket] ?? bucket} {Math.round((count / selected.count) * 100)}%
                  </span>
                ))}
              <span className="text-navy-500 tabular-nums">({selected.count}件)</span>
            </span>
          )
        ) : (
          <span className="text-navy-500">セルにカーソルを合わせると頻度の内訳が表示されます</span>
        )}
      </div>
    </div>
  );
}
