"use client";

import { useState } from "react";
import { OPEN_RAISE_BUCKET, mergeOpenRaiseByBucket, type HandClassMatrixResult } from "@/lib/geoApi";
import { bucketColor, bucketOrderIndex } from "./colors";

/**
 * 169 の手の表(GTO タブと同じ作り)。マスの中を行動の割合で左から強い順に塗り分ける。手を押すと下に内訳。
 * 件数の無い手は薄く出す。
 */
export function GeoRangeGrid({
  matrix,
  bucketLabels,
  mergeOpenRaise,
}: {
  matrix: HandClassMatrixResult;
  bucketLabels: Record<string, string>;
  mergeOpenRaise: boolean;
}) {
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const partsOf = (byBucket: Record<string, number>) => {
    const m = mergeOpenRaise ? mergeOpenRaiseByBucket(byBucket) : { byBucket };
    const rep = "openRaiseRepresentative" in m ? m.openRaiseRepresentative : undefined;
    const total = Object.values(m.byBucket).reduce((a, b) => a + b, 0);
    return Object.entries(m.byBucket)
      .filter(([, v]) => v > 0)
      .sort((a, b) => bucketOrderIndex(b[0]) - bucketOrderIndex(a[0]))
      .map(([b, v]) => ({ bucket: b, color: bucketColor(b === OPEN_RAISE_BUCKET && rep ? rep : b), frac: total > 0 ? v / total : 0, count: v }));
  };
  const cell = sel ? matrix.cells[sel.r]?.[sel.c] : undefined;
  return (
    <div>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
        {matrix.cells.flatMap((row, r) =>
          row.map((c, ci) => {
            const parts = partsOf(c.byBucket);
            return (
              <button
                key={`${r}-${ci}`}
                type="button"
                onClick={() => setSel({ r, c: ci })}
                className={`relative aspect-square overflow-hidden rounded-[3px] bg-[#2a2a2d] ${sel?.r === r && sel?.c === ci ? "ring-2 ring-white" : ""}`}
                style={{ opacity: c.count > 0 ? 1 : 0.25 }}
              >
                <span className="absolute inset-0 flex">
                  {parts.map((p) => (
                    <span key={p.bucket} style={{ width: `${p.frac * 100}%`, background: p.color }} />
                  ))}
                </span>
                <span className="relative text-[clamp(7px,2.2vw,11px)] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
                  {c.label}
                </span>
              </button>
            );
          }),
        )}
      </div>
      <div className="mt-3 rounded-xl bg-[#1b1b1d] p-3">
        {!cell ? (
          <p className="text-[12px] text-[#9a9a9a]">表の手を押すと、行動ごとの割合と件数が出る。</p>
        ) : (
          <>
            <p className="mb-1.5 text-[14px] font-black text-white">
              {cell.label}
              <span className="ml-2 text-[11px] font-bold text-[#9a9a9a]">{cell.count.toLocaleString()}件</span>
            </p>
            {partsOf(cell.byBucket).map((p) => (
              <div key={p.bucket} className="flex items-center gap-2 py-0.5 text-[13px] tabular-nums">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
                <span className="flex-1 text-[#cfcfcf]">{bucketLabels[p.bucket] ?? p.bucket}</span>
                <span className="w-16 text-right text-white">{(p.frac * 100).toFixed(1)}%</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
