"use client";

import { useState } from "react";
import type { RangeCell, RangeMatrixResult } from "@/lib/geoApi";

/**
 * GTO Wizardのレンジグリッドを踏襲した13x13ハンドマトリクス。
 * 各セルは頻度に応じて「レイズ(オレンジ)/コール(ブルー)/フォールド(グレー)」を
 * 左から右へ帯状に積み上げたグラデーションで塗り、サンプルが無いセルは暗いグレーの空セルにする。
 */
export function RangeMatrix({
  data,
  onHoverCell,
}: {
  data: RangeMatrixResult;
  onHoverCell?: (cell: RangeCell | null) => void;
}) {
  const [selected, setSelected] = useState<RangeCell | null>(null);

  function cellStyle(cell: RangeCell): React.CSSProperties {
    const total = cell.raise + cell.call + cell.fold;
    if (total === 0) return { background: "#151519" };
    const raisePct = (cell.raise / total) * 100;
    const callPct = (cell.call / total) * 100;
    const foldPct = 100 - raisePct - callPct;
    const stops: string[] = [];
    let cursor = 0;
    if (raisePct > 0) {
      stops.push(`#c98500 ${cursor}% ${cursor + raisePct}%`);
      cursor += raisePct;
    }
    if (callPct > 0) {
      stops.push(`#3987e5 ${cursor}% ${cursor + callPct}%`);
      cursor += callPct;
    }
    if (foldPct > 0) {
      stops.push(`#3a3a42 ${cursor}% 100%`);
    }
    return { background: `linear-gradient(90deg, ${stops.join(", ")})` };
  }

  return (
    <div>
      <div className="grid gap-[2px] rounded-lg overflow-hidden bg-ink-950 p-[2px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
        {data.cells.map((row, r) =>
          row.map((cell, c) => {
            const isPair = r === c;
            const total = cell.raise + cell.call + cell.fold;
            return (
              <button
                key={`${r}-${c}`}
                style={cellStyle(cell)}
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
                className={`aspect-square flex items-center justify-center text-[9px] sm:text-[10px] font-semibold transition-transform focus:outline-none hover:z-10 hover:scale-110 hover:ring-1 hover:ring-ink-50 ${
                  total === 0 ? "text-ink-600" : "text-ink-950"
                } ${isPair ? "font-bold" : ""}`}
                title={`${cell.label}: ${total} サンプル`}
              >
                {cell.label}
              </button>
            );
          }),
        )}
      </div>

      <div className="h-9 mt-2 text-[11px] text-ink-400 flex items-center">
        {selected ? (
          <CellSummary cell={selected} />
        ) : (
          <span className="text-ink-600">セルにカーソルを合わせると頻度の内訳が表示されます</span>
        )}
      </div>
    </div>
  );
}

function CellSummary({ cell }: { cell: RangeCell }) {
  const total = cell.raise + cell.call + cell.fold;
  if (total === 0) {
    return (
      <span>
        <span className="text-ink-200 font-medium">{cell.label}</span>
        <span className="text-ink-600"> — サンプルなし</span>
      </span>
    );
  }
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <span className="flex items-center gap-3 flex-wrap">
      <span className="text-ink-100 font-semibold">{cell.label}</span>
      <span className="flex items-center gap-1 text-[#c98500]">
        <span className="h-2 w-2 rounded-full bg-[#c98500]" />
        レイズ {pct(cell.raise)}%
      </span>
      <span className="flex items-center gap-1 text-[#3987e5]">
        <span className="h-2 w-2 rounded-full bg-[#3987e5]" />
        コール {pct(cell.call)}%
      </span>
      <span className="flex items-center gap-1 text-ink-400">
        <span className="h-2 w-2 rounded-full bg-ink-600" />
        フォールド {pct(cell.fold)}%
      </span>
      <span className="text-ink-600 tabular-nums">({total}件)</span>
    </span>
  );
}
