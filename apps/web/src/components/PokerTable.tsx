"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PublicHandState } from "@meta-geo/engine";
// deck.ts(node:crypto に依存)を含むバレル経由だとブラウザバンドルが壊れるため、
// cardToString は依存の少ないサブモジュールから直接インポートする。
import { cardToString } from "@meta-geo/engine/src/types/card.js";
import { PlayingCard } from "./PlayingCard";
import { Seat, type SeatBadge } from "./Seat";
import { positionLabel } from "@/lib/position";
import { formatBb, formatSignedBb } from "@/lib/format";
import { useActingCountdown } from "@/lib/useActingCountdown";
import type { SeatAction } from "@/lib/socket";

// felt.png(スーパー楕円デザイン、幅:高さ = 1000:1500 = 2:3)の実ピクセルを解析し、
// 外枠のコンテナがその比率と正確に一致するよう算出してある(18%/10%/18% → 幅64%:高さ72% → 2:3)。
// 一致させることで、画像自体の形がそのままテーブルの形になり、余白や別枠のクロップが生じない。
const FELT_BOX = "inset-x-[18%] top-[10%] bottom-[18%]";

// 画像内のロゴ帯(上部 約5-31%)・破線カードスロット帯(約44-56%)・ワードマーク/下部ロゴ帯
// (約59-78%)を実測し、それに合わせた座席配置。
const SEAT_LAYOUT: Record<number, string> = {
  0: "bottom-0 left-1/2 -translate-x-1/2",
  1: "top-[2%] left-1/2 -translate-x-1/2",
  2: "top-[17%] left-[12%]",
  3: "top-[17%] right-[12%]",
  4: "top-[55%] left-[7%]",
  5: "top-[55%] right-[7%]",
};

const DEALER_LAYOUT: Record<number, string> = {
  0: "bottom-[23%] left-1/2 translate-x-9",
  1: "top-[14%] left-1/2 translate-x-11",
  2: "top-[25%] left-[27%]",
  3: "top-[25%] right-[27%]",
  4: "top-[58%] left-[22%]",
  5: "top-[58%] right-[22%]",
};

/**
 * `public/table/felt.png` が存在すればそれをテーブルの形そのものとして描画し、無ければ現行の
 * 楕円グラデーション描画にフォールバックする(詳細は public/table/README.md 参照)。
 * 画像が読み込めた場合は、外枠の丸み・リング・影といった「額縁」を消し、画像自体の輪郭だけが
 * 見えるようにする(既存の楕円枠に画像をはめ込むのではなく、画像の形がそのままテーブルになる)。
 */
function TableFelt() {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showFrame = failed || !loaded;

  return (
    <div
      className={`absolute ${FELT_BOX} overflow-hidden transition-[border-radius,box-shadow] duration-300 ${
        showFrame
          ? "rounded-[46%] bg-gradient-to-b from-navy-800 to-navy-900 ring-1 ring-black/40 shadow-[inset_0_2px_24px_rgba(0,0,0,0.55)]"
          : ""
      }`}
    >
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/table/felt.png"
          alt=""
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
      {showFrame && <div className="absolute inset-3 rounded-[46%] ring-1 ring-white/[0.04]" />}
    </div>
  );
}

function DealerButton({ buttonFixedPos }: { buttonFixedPos: number }) {
  const layout = DEALER_LAYOUT[buttonFixedPos];
  if (!layout) return null;
  return (
    <motion.div
      layout
      className={`absolute z-10 h-6 w-6 rounded-full bg-white text-navy-950 text-[11px] font-bold flex items-center justify-center shadow-card ring-1 ring-black/10 ${layout}`}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
    >
      D
    </motion.div>
  );
}

function badgeForSeat(params: {
  seatIndex: number;
  seatStatus: string;
  actingSeatIndex: number | null;
  secondsLeft: number;
  lastActionBySeat: Record<number, SeatAction>;
  lastHandDeltaBySeat: Record<number, number> | null;
  bigBlind: number;
}): SeatBadge | null {
  const { seatIndex, seatStatus, actingSeatIndex, secondsLeft, lastActionBySeat, lastHandDeltaBySeat, bigBlind } = params;

  if (lastHandDeltaBySeat && seatStatus !== "folded" && seatStatus !== "empty") {
    const delta = lastHandDeltaBySeat[seatIndex];
    if (delta) {
      return delta > 0
        ? { text: `Won ${formatSignedBb(delta, bigBlind)}`, tone: "win" }
        : { text: `Lost ${formatSignedBb(delta, bigBlind)}`, tone: "lose" };
    }
  }

  if (actingSeatIndex === seatIndex) {
    return { text: String(secondsLeft), tone: "timer" };
  }

  const action = lastActionBySeat[seatIndex];
  if (action) {
    const bb = formatBb(action.toAmount, bigBlind);
    switch (action.kind) {
      case "raise":
        return { text: `Raise ${bb}`, tone: "raise" };
      case "bet":
        return { text: `Bet ${bb}`, tone: "raise" };
      case "call":
        return { text: `Call ${bb}`, tone: "call" };
      case "check":
        return { text: "Check", tone: "call" };
      case "fold":
        return { text: "Fold", tone: "fold" };
      case "allIn":
        return { text: `All In ${bb}`, tone: "raise" };
    }
  }

  return null;
}

export function PokerTable({
  state,
  yourSeatIndex,
  yourCards,
  seatCount,
  revealedHoleCards,
  players,
  bigBlind,
  lastActionBySeat,
  lastHandDeltaBySeat,
}: {
  state: PublicHandState | null;
  yourSeatIndex: number | null;
  yourCards: string[];
  seatCount: number;
  revealedHoleCards: Record<number, string[]> | null;
  players: Record<number, string>;
  bigBlind: number;
  lastActionBySeat: Record<number, SeatAction>;
  lastHandDeltaBySeat: Record<number, number> | null;
}) {
  const seatsByIndex = new Map((state?.seats ?? []).map((s) => [s.seatIndex, s]));
  const secondsLeft = useActingCountdown(state?.actingSeatIndex ?? null);

  const activeStacks = (state?.seats ?? [])
    .filter((s) => s.status === "active" || s.status === "allIn")
    .map((s) => s.stack + s.streetContribution);
  const effectiveStack = activeStacks.length ? Math.min(...activeStacks) : 0;
  const spr = state && state.potTotal > 0 ? effectiveStack / state.potTotal : null;

  return (
    <div className="relative w-full aspect-[3/4] max-w-md mx-auto">
      {/* felt table */}
      <TableFelt />

      {state && <DealerButton buttonFixedPos={state.buttonFixedPos} />}

      {/* ポット表示: felt.png内の水平破線(画像内 約32-35%)のあたりに合わせてある */}
      <div className="absolute inset-x-0 top-[33%] flex justify-center">
        <AnimatePresence mode="popLayout">
          {state && state.potTotal > 0 && (
            <motion.div
              key={state.potTotal}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-full bg-black/40 backdrop-blur px-3 py-1 text-xs font-medium text-navy-100 tabular-nums ring-1 ring-navy-600/40"
            >
              <span className="italic">Pot</span> {formatBb(state.potTotal, bigBlind)}
              {spr !== null && <span className="text-navy-400"> (SPR {spr.toFixed(1)})</span>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/*
        コミュニティカード欄: felt.png内の5つの破線カードスロットの実ピクセル位置を解析して
        合わせてある(スロット群のbbox: x=14.7-85.2%, y=43.9-58.3%(画像内))。
      */}
      <div className="absolute inset-x-0 top-[41.6%] flex justify-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => {
          const card = state?.board[i];
          if (card) {
            return <PlayingCard key={`${cardToString(card)}-${i}`} card={cardToString(card)} size="board" dealDelay={i * 0.06} />;
          }
          return <div key={i} className="h-[50px] w-[29px] rounded-md bg-navy-800/50 ring-1 ring-navy-600/30" />;
        })}
      </div>

      {/* opponent seats */}
      {[1, 2, 3, 4, 5].map((seatIndex) => {
        if (seatIndex >= seatCount) return null;
        const seat = seatsByIndex.get(seatIndex);
        const revealed = revealedHoleCards?.[seatIndex];
        const status = seat?.status ?? "empty";
        return (
          <div key={seatIndex} className={`absolute ${SEAT_LAYOUT[seatIndex]}`}>
            <Seat
              name={players[seatIndex] ?? `BOT-${seatIndex}`}
              position={state ? positionLabel(seatIndex, state.buttonFixedPos, seatCount) : ""}
              stack={seat?.stack ?? 0}
              streetContribution={seat?.streetContribution ?? 0}
              bigBlind={bigBlind}
              status={status}
              isActingSeat={state?.actingSeatIndex === seatIndex}
              isDimmed={Boolean(state?.actingSeatIndex !== null && state?.actingSeatIndex !== undefined && state.actingSeatIndex !== seatIndex)}
              isHero={false}
              holeCards={revealed ? revealed : [null, null]}
              revealCards={Boolean(revealed)}
              badge={badgeForSeat({
                seatIndex,
                seatStatus: status,
                actingSeatIndex: state?.actingSeatIndex ?? null,
                secondsLeft,
                lastActionBySeat,
                lastHandDeltaBySeat,
                bigBlind,
              })}
            />
          </div>
        );
      })}

      {/* hero seat, bottom center, larger */}
      <div className={`absolute ${SEAT_LAYOUT[0]}`}>
        <Seat
          name={(yourSeatIndex !== null ? players[yourSeatIndex] : undefined) ?? "YOU"}
          position={state && yourSeatIndex !== null ? positionLabel(yourSeatIndex, state.buttonFixedPos, seatCount) : ""}
          stack={(yourSeatIndex !== null ? seatsByIndex.get(yourSeatIndex)?.stack : undefined) ?? 0}
          streetContribution={(yourSeatIndex !== null ? seatsByIndex.get(yourSeatIndex)?.streetContribution : undefined) ?? 0}
          bigBlind={bigBlind}
          status={(yourSeatIndex !== null ? seatsByIndex.get(yourSeatIndex)?.status : undefined) ?? "empty"}
          isActingSeat={yourSeatIndex !== null && state?.actingSeatIndex === yourSeatIndex}
          isDimmed={Boolean(
            state?.actingSeatIndex !== null &&
              state?.actingSeatIndex !== undefined &&
              yourSeatIndex !== null &&
              state.actingSeatIndex !== yourSeatIndex,
          )}
          isHero
          holeCards={yourCards.length ? yourCards : [null, null]}
          revealCards
          size="lg"
          badge={
            yourSeatIndex !== null
              ? badgeForSeat({
                  seatIndex: yourSeatIndex,
                  seatStatus: seatsByIndex.get(yourSeatIndex)?.status ?? "empty",
                  actingSeatIndex: state?.actingSeatIndex ?? null,
                  secondsLeft,
                  lastActionBySeat,
                  lastHandDeltaBySeat,
                  bigBlind,
                })
              : null
          }
        />
      </div>
    </div>
  );
}
