"use client";

import type { HandDetail } from "@/lib/geoApi";
import { PlayingCard } from "@/components/PlayingCard";

const STREET_LABEL: Record<string, string> = { preflop: "プリフロップ", flop: "フロップ", turn: "ターン", river: "リバー" };
const KIND_LABEL: Record<string, string> = {
  fold: "フォールド",
  check: "チェック",
  call: "コール",
  bet: "ベット",
  raise: "レイズ",
  allIn: "オールイン",
};

export function HandDetailPanel({ hand }: { hand: HandDetail | null }) {
  if (!hand) {
    return (
      <div className="rounded-2xl bg-ink-100/70 ring-1 ring-ink-400/50 p-6 text-center text-sm text-ink-600">
        左のハンド一覧からハンドを選ぶと、全プレイヤーのホールカードとアクション履歴を確認できます。
      </div>
    );
  }

  let lastStreet: string | null = null;

  return (
    <div className="rounded-2xl bg-ink-100/70 ring-1 ring-ink-400/50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink-900">
          Hand #{hand.handNumber}{" "}
          <span className="text-ink-600 text-[12px] font-normal">
            {hand.levelSmallBlind.toLocaleString()}/{hand.levelBigBlind.toLocaleString()}
          </span>
        </h3>
        <span className="text-gold-600 text-sm font-medium tabular-nums">POT {hand.potTotal.toLocaleString()}</span>
      </div>

      {hand.board.length > 0 && (
        <div className="flex gap-1.5">
          {hand.board.map((c, i) => (
            <PlayingCard key={i} card={c} size="md" dealDelay={0} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {hand.seats.map((s) => (
          <div key={s.seatIndex} className="rounded-xl bg-ink-200/80 ring-1 ring-ink-400/50 px-2.5 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-ink-800 truncate">
                {s.displayName}
                {s.isBigBlind && <span className="text-gold-600 ml-1">BB</span>}
                {s.isSmallBlind && <span className="text-gold-600 ml-1">SB</span>}
              </span>
              <span className={`text-[11px] tabular-nums ${s.resultStackDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {s.resultStackDelta >= 0 ? "+" : ""}
                {s.resultStackDelta.toLocaleString()}
              </span>
            </div>
            <div className="flex gap-1 mt-1.5">
              {s.holeCards.length > 0 ? (
                s.holeCards.map((c, i) => <PlayingCard key={i} card={c} size="sm" dealDelay={0} />)
              ) : (
                <span className="text-[10px] text-ink-500">非公開</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h4 className="text-[11px] text-ink-600 mb-2">アクション履歴</h4>
        <div className="space-y-1 max-h-64 overflow-y-auto no-scrollbar text-[12px]">
          {hand.actions
            .filter((a) => a.kind !== "postBlind" && a.kind !== "postAnte")
            .map((a, i) => {
              const showStreetHeader = a.street !== lastStreet;
              lastStreet = a.street;
              return (
                <div key={i}>
                  {showStreetHeader && (
                    <div className="text-[10px] uppercase tracking-wider text-ink-500 mt-2 mb-1">
                      {STREET_LABEL[a.street] ?? a.street}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-ink-800">
                    <span>
                      seat{a.seatIndex} {KIND_LABEL[a.kind] ?? a.kind}
                      {a.toAmount !== null && <span className="text-ink-900 tabular-nums"> → {a.toAmount.toLocaleString()}</span>}
                    </span>
                    <span className="text-ink-500 tabular-nums">pot {a.potBefore.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
