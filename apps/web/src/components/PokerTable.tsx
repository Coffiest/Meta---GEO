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
import type { SeatAction, SeatPlayerInfo, TurnTimerInfo } from "@/lib/socket";

// felt.png(スーパー楕円デザイン、幅:高さ = 1000:1500 = 2:3)の実ピクセルを解析し、
// 外枠のコンテナがその比率と正確に一致するよう算出してある(18%/10%/18% → 幅64%:高さ72% → 2:3)。
// 一致させることで、画像自体の形がそのままテーブルの形になり、余白や別枠のクロップが生じない。
const FELT_BOX = "inset-x-[18%] top-[10%] bottom-[18%]";

// 画像内のロゴ帯(上部 約5-31%)・破線カードスロット帯(約44-56%)・ワードマーク/下部ロゴ帯
// (約59-78%)を実測し、それに合わせた「表示スロット」配置。スロット0=常に自分(画面下)。
const SEAT_LAYOUT: Record<number, string> = {
  0: "bottom-0 left-1/2 -translate-x-1/2",
  1: "top-[55%] left-[4%]",
  2: "top-[17%] left-[7%]",
  3: "top-[2%] left-1/2 -translate-x-1/2",
  4: "top-[17%] right-[7%]",
  5: "top-[55%] right-[4%]",
};

const DEALER_LAYOUT: Record<number, string> = {
  0: "bottom-[23%] left-1/2 translate-x-9",
  1: "top-[58%] left-[22%]",
  2: "top-[25%] left-[24%]",
  3: "top-[14%] left-1/2 translate-x-11",
  4: "top-[25%] right-[24%]",
  5: "top-[58%] right-[22%]",
};

/**
 * `public/table/felt.png` が存在すればそれをテーブルの形そのものとして描画し、無ければ現行の
 * 楕円グラデーション描画にフォールバックする(詳細は public/table/README.md 参照)。
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

function DealerButton({ displaySlot }: { displaySlot: number }) {
  const layout = DEALER_LAYOUT[displaySlot];
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
  lastActionBySeat: Record<number, SeatAction>;
  lastHandDeltaBySeat: Record<number, number> | null;
  bigBlind: number;
}): SeatBadge | null {
  const { seatIndex, seatStatus, lastActionBySeat, lastHandDeltaBySeat, bigBlind } = params;

  if (lastHandDeltaBySeat && seatStatus !== "folded" && seatStatus !== "empty") {
    const delta = lastHandDeltaBySeat[seatIndex];
    if (delta) {
      return delta > 0
        ? { text: `Won ${formatSignedBb(delta, bigBlind)}`, tone: "win" }
        : { text: `Lost ${formatSignedBb(delta, bigBlind)}`, tone: "lose" };
    }
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

/*
 * ボードのコミュニティカード欄: felt.png内の5つの破線カードスロットの実ピクセル位置を
 * 解析して合わせてある。
 *  - スロット群のbbox(画像内): x=14.7〜85.2%, y=43.9〜58.3%
 *  - コンテナ換算: 帯の幅 = 70.5% × 64%(felt幅) = 45.1%、1スロット幅 = 12.65% × 64% ≒ 8.1%
 *  - スロット間ギャップ = 1.8125% × 64% ≒ 1.16%
 *  - 縦中心 = 10% + 51.1% × 72%(felt高) ≒ 46.8% → カード上端 ≒ 42.5%
 */
const BOARD_ROW_CLASS = "absolute inset-x-0 top-[42.5%] flex justify-center gap-[1.16%]";
const BOARD_CELL_CLASS = "w-[8.1%]";

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
  turnTimer,
}: {
  state: PublicHandState | null;
  yourSeatIndex: number | null;
  yourCards: string[];
  seatCount: number;
  revealedHoleCards: Record<number, string[]> | null;
  players: Record<number, SeatPlayerInfo>;
  bigBlind: number;
  lastActionBySeat: Record<number, SeatAction>;
  lastHandDeltaBySeat: Record<number, number> | null;
  turnTimer: TurnTimerInfo | null;
}) {
  const seatsByIndex = new Map((state?.seats ?? []).map((s) => [s.seatIndex, s]));

  // 自分の席が常に画面下(スロット0)に来るよう、実席番号→表示スロットへ回転させる。
  // MTTでは卓移動により自分の席番号が変わるため、この回転が必須になる。
  const heroSeat = yourSeatIndex ?? 0;
  const displaySlotOf = (seatIndex: number) => (((seatIndex - heroSeat) % seatCount) + seatCount) % seatCount;

  const activeStacks = (state?.seats ?? [])
    .filter((s) => s.status === "active" || s.status === "allIn")
    .map((s) => s.stack + s.streetContribution);
  const effectiveStack = activeStacks.length ? Math.min(...activeStacks) : 0;
  const spr = state && state.potTotal > 0 ? effectiveStack / state.potTotal : null;

  return (
    <div className="relative w-full aspect-[3/4] max-w-md mx-auto">
      <TableFelt />

      {state && <DealerButton displaySlot={displaySlotOf(state.buttonFixedPos)} />}

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

      {/* コミュニティカード。空きスロットはfelt.png自体に描かれた破線枠が見えるので何も描かない */}
      <div className={BOARD_ROW_CLASS}>
        {Array.from({ length: 5 }).map((_, i) => {
          const card = state?.board[i];
          return (
            <div key={i} className={BOARD_CELL_CLASS}>
              {card && <PlayingCard card={cardToString(card)} size="board" dealDelay={i * 0.06} />}
            </div>
          );
        })}
      </div>

      {/* 全座席(スロット0=自分が常に下) */}
      {Array.from({ length: seatCount }).map((_, seatIndex) => {
        const slot = displaySlotOf(seatIndex);
        const isHero = yourSeatIndex !== null && seatIndex === yourSeatIndex;
        if (slot === 0 && !isHero && yourSeatIndex !== null) return null;
        const seat = seatsByIndex.get(seatIndex);
        const player = players[seatIndex];
        const status = seat?.status ?? "empty";
        if (!player && !seat) return null;
        const revealed = revealedHoleCards?.[seatIndex];
        const timerForSeat =
          turnTimer && turnTimer.seatIndex === seatIndex && state?.actingSeatIndex === seatIndex
            ? { endsAt: turnTimer.endsAt, durationMs: turnTimer.durationMs }
            : null;

        return (
          <div key={seatIndex} className={`absolute ${SEAT_LAYOUT[slot]}`}>
            <Seat
              name={player?.displayName ?? (isHero ? "YOU" : `Seat ${seatIndex + 1}`)}
              avatarKey={player?.avatarKey ?? null}
              position={state ? positionLabel(seatIndex, state.buttonFixedPos, seatCount) : ""}
              stack={seat?.stack ?? 0}
              streetContribution={seat?.streetContribution ?? 0}
              bigBlind={bigBlind}
              status={status}
              isActingSeat={state?.actingSeatIndex === seatIndex}
              isHero={isHero}
              holeCards={isHero ? (yourCards.length ? yourCards : [null, null]) : revealed ? revealed : [null, null]}
              revealCards={isHero || Boolean(revealed)}
              timer={timerForSeat}
              size={isHero ? "lg" : "sm"}
              badge={badgeForSeat({
                seatIndex,
                seatStatus: status,
                lastActionBySeat,
                lastHandDeltaBySeat,
                bigBlind,
              })}
            />
          </div>
        );
      })}
    </div>
  );
}
