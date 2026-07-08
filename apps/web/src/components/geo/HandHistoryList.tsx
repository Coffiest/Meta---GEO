"use client";

import type { RecentHandSummary } from "@/lib/geoApi";
import { PlayingCard } from "@/components/PlayingCard";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function HandHistoryList({
  hands,
  selectedId,
  onSelect,
}: {
  hands: RecentHandSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (hands.length === 0) {
    return (
      <div className="rounded-2xl bg-ink-900/70 ring-1 ring-ink-700/50 p-6 text-center text-sm text-ink-500">
        まだハンドが記録されていません。テーブルでプレイすると、ここに表示されます。
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-ink-900/70 ring-1 ring-ink-700/50 divide-y divide-ink-700/50 overflow-hidden">
      {hands.map((h) => (
        <button
          key={h.id}
          onClick={() => onSelect(h.id)}
          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
            selectedId === h.id ? "bg-ink-800/80" : "hover:bg-ink-800/40"
          }`}
        >
          <div className="flex gap-1 w-[140px] shrink-0">
            {h.board.length === 0 ? (
              <span className="text-[11px] text-ink-600">(プリフロップ終了)</span>
            ) : (
              h.board.map((c, i) => <PlayingCard key={i} card={c} size="sm" dealDelay={0} />)
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-ink-200">
              Hand #{h.handNumber} <span className="text-ink-500">・ {h.seatCount}人</span>
            </div>
            <div className="text-[11px] text-ink-500">{formatTime(h.createdAt)}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[12px] font-medium text-gold-400 tabular-nums">{h.potTotal.toLocaleString()}</div>
            <div className="text-[10px] text-ink-500">{h.wonByFold ? "フォールドで決着" : "ショーダウン"}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
