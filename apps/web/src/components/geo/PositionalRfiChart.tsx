"use client";

import { useState } from "react";
import type { PositionalRfiStat } from "@/lib/geoApi";

const SERIES = [
  { key: "raises", label: "オープンレイズ", color: "bg-chart-raise", text: "text-chart-raise" },
  { key: "checks", label: "チェック", color: "bg-chart-check", text: "text-chart-check" },
  { key: "limps", label: "リンプ/コール", color: "bg-chart-limp", text: "text-chart-limp" },
  { key: "folds", label: "フォールド", color: "bg-chart-fold", text: "text-chart-fold" },
] as const;

interface SegmentHover {
  position: string;
  seriesLabel: string;
  count: number;
  pct: number;
}

export function PositionalRfiChart({ data }: { data: PositionalRfiStat[] }) {
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<SegmentHover | null>(null);

  return (
    <div className="rounded-2xl bg-ink-900/70 ring-1 ring-ink-700/50 p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <h3 className="text-sm font-medium text-ink-100">ポジション別 プリフロップ・オープン頻度(RFI)</h3>
          <p className="text-[11px] text-ink-500 mt-0.5">
            まだ誰もレイズしていない状態で自分の番が回ってきたとき、実際に何をしたか(母集団の実測値)
          </p>
        </div>
        <button
          onClick={() => setShowTable((v) => !v)}
          className="shrink-0 rounded-full bg-ink-800 text-ink-300 text-[11px] px-3 py-1.5 ring-1 ring-ink-600/60 hover:text-ink-100 transition-colors"
        >
          {showTable ? "チャート表示" : "テーブル表示"}
        </button>
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 mb-4">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-[11px] text-ink-300">
            <span className={`h-2 w-2 rounded-full ${s.color}`} />
            {s.label}
          </div>
        ))}
      </div>

      {showTable ? (
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-[12px] tabular-nums">
            <thead>
              <tr className="text-ink-500 text-left">
                <th className="font-normal pb-2 pr-3 whitespace-nowrap">ポジション</th>
                <th className="font-normal pb-2 pr-3 text-right whitespace-nowrap">機会数</th>
                {SERIES.map((s) => (
                  <th key={s.key} className={`font-normal pb-2 pl-3 text-right whitespace-nowrap ${s.text}`}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.position} className="border-t border-ink-700/50">
                  <td className="py-2 pr-3 text-ink-100 font-medium whitespace-nowrap">{row.position}</td>
                  <td className="py-2 pr-3 text-right text-ink-300 whitespace-nowrap">{row.opportunities}</td>
                  {SERIES.map((s) => {
                    const count = row[s.key];
                    const pct = row.opportunities > 0 ? Math.round((count / row.opportunities) * 100) : 0;
                    return (
                      <td key={s.key} className="py-2 pl-3 text-right text-ink-300 whitespace-nowrap">
                        {count} <span className="text-ink-500">({pct}%)</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((row) => (
            <div key={row.position} className="flex items-center gap-3">
              <div className="w-9 shrink-0 text-[12px] font-medium text-ink-200">{row.position}</div>
              <div className="flex-1 flex h-5 rounded-full overflow-hidden bg-ink-800" role="img" aria-label={`${row.position}: ${row.opportunities}件`}>
                {row.opportunities === 0 ? (
                  <div className="w-full h-full bg-ink-800" />
                ) : (
                  SERIES.map((s) => {
                    const count = row[s.key];
                    if (count === 0) return null;
                    const pct = (count / row.opportunities) * 100;
                    const showLabel = pct >= 14;
                    return (
                      <button
                        key={s.key}
                        style={{ width: `${pct}%` }}
                        className={`${s.color} h-full flex items-center justify-center border-r-2 border-ink-900 last:border-r-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-50`}
                        onMouseEnter={() =>
                          setHover({ position: row.position, seriesLabel: s.label, count, pct: Math.round(pct) })
                        }
                        onFocus={() =>
                          setHover({ position: row.position, seriesLabel: s.label, count, pct: Math.round(pct) })
                        }
                        onMouseLeave={() => setHover(null)}
                        onBlur={() => setHover(null)}
                        aria-label={`${s.label} ${Math.round(pct)}%`}
                      >
                        {showLabel && <span className="text-[10px] font-semibold text-ink-950">{Math.round(pct)}%</span>}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="w-9 shrink-0 text-right text-[11px] text-ink-500 tabular-nums">{row.opportunities}</div>
            </div>
          ))}

          <div className="h-5 text-[11px] text-ink-400">
            {hover ? (
              <span>
                <span className="text-ink-200 font-medium">{hover.position}</span> の{hover.seriesLabel}:{" "}
                <span className="text-ink-100 font-medium tabular-nums">{hover.count}</span>件 ({hover.pct}%)
              </span>
            ) : (
              <span className="text-ink-600">セグメントにカーソルを合わせると内訳が表示されます</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
