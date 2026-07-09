"use client";

import { bucketColor } from "./colors";

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
 */
export function PositionPillBar({
  items,
  onTruncate,
}: {
  items: PillBarItem[];
  onTruncate: (street: Street, lineIndex: number) => void;
}) {
  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto no-scrollbar">
      {items.map((item, i) =>
        item.kind === "street" ? (
          <div
            key={`street-${i}`}
            className="shrink-0 flex items-center gap-1.5 rounded-xl bg-navy-900 ring-1 ring-navy-700 px-2.5 py-1.5"
          >
            <span className="text-[9px] font-bold tracking-widest text-gold-500">{STREET_LABEL[item.street]}</span>
            <div className="flex gap-0.5">
              {item.cards.map((c) => (
                <div key={c} className="h-7 w-5 rounded-sm bg-navy-50 flex flex-col items-center justify-center text-[8px] font-bold leading-none">
                  <span className={suitTextClass(c)}>{c.slice(0, -1)}</span>
                  <span className={suitTextClass(c)}>{suitSymbol(c)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button
            key={`${item.street}-${item.position}-${i}`}
            disabled={item.state === "future" || item.lineIndex === undefined}
            onClick={() => item.lineIndex !== undefined && onTruncate(item.street, item.lineIndex)}
            className={`shrink-0 rounded-xl px-2.5 py-1.5 text-left transition-colors min-w-[64px] ${
              item.state === "active"
                ? "bg-navy-900 ring-2 ring-gold-500"
                : item.state === "decided"
                  ? "bg-navy-900 ring-1 ring-navy-600/60"
                  : "bg-navy-950 ring-1 ring-navy-800 opacity-50"
            }`}
          >
            <div className="text-[9px] font-bold tracking-wide text-navy-400">{item.position}</div>
            {item.state === "decided" ? (
              <div
                className="text-[11px] font-semibold truncate max-w-[90px]"
                style={{ color: bucketColor(item.bucket ?? "", item.geometricRatio) }}
              >
                {item.actionLabel}
              </div>
            ) : (
              <div className="text-[11px] font-medium text-navy-500">{item.state === "active" ? "選択中" : "—"}</div>
            )}
          </button>
        ),
      )}
    </div>
  );
}
