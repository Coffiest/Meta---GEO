"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { usePokerSocket } from "@/lib/socket";
import { PokerTable } from "@/components/PokerTable";
import { ActionBar } from "@/components/ActionBar";

const SEAT_COUNT = 6;

function NameGate({ onEnter }: { onEnter: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-8">
      <div className="text-center space-y-2">
        <div className="text-[13px] tracking-[0.3em] text-gold-500 font-medium">TEN FOUR POKER</div>
        <h1 className="text-2xl font-semibold text-ink-50">トーナメントに参加</h1>
        <p className="text-sm text-ink-400 max-w-xs mx-auto">
          ソロテスト用テーブルです。あなたが着席すると、BOTが自動的に席を埋めてすぐに開始します。
        </p>
      </div>
      <div className="w-full max-w-xs space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="表示名"
          maxLength={16}
          className="w-full rounded-xl bg-ink-900 ring-1 ring-ink-700 px-4 py-3 text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none focus:ring-gold-500"
        />
        <button
          onClick={() => onEnter(name.trim() || `Guest-${Math.random().toString(36).slice(2, 6)}`)}
          className="w-full rounded-xl bg-gold-500 text-ink-950 font-semibold py-3 shadow-card active:scale-[0.98] transition-transform"
        >
          テーブルに着席する
        </button>
      </div>
    </div>
  );
}

function GameScreen({ displayName }: { displayName: string }) {
  const { connected, spectating, state, yourSeatIndex, yourCards, lastHandEnded, level, tournamentOver, actionError, sendAction } =
    usePokerSocket(displayName);

  const yourSeat = useMemo(
    () => (yourSeatIndex !== null ? state?.seats.find((s) => s.seatIndex === yourSeatIndex) : undefined),
    [state, yourSeatIndex],
  );

  const isYourTurn = yourSeatIndex !== null && state?.actingSeatIndex === yourSeatIndex && !state.isComplete;
  const toCall = state && yourSeat ? Math.max(0, state.currentBetToMatch - yourSeat.streetContribution) : 0;
  const maxRaiseToAmount = yourSeat ? yourSeat.streetContribution + yourSeat.stack : 0;
  const minRaiseToAmount = state ? Math.min(maxRaiseToAmount, state.currentBetToMatch + state.lastFullRaiseSize) : 0;

  const revealedHoleCards = lastHandEnded
    ? Object.fromEntries(Object.entries(lastHandEnded.holeCards).map(([seat, cards]) => [Number(seat), cards]))
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-2">
        <div className="text-[11px] tracking-[0.25em] text-gold-500 font-medium">TEN FOUR POKER</div>
        <div className="flex items-center gap-3 text-[11px] text-ink-400">
          <Link href="/geo" className="text-ink-300 hover:text-gold-400 transition-colors">
            GEO分析
          </Link>
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-500"}`} />
          {level ? (
            <span className="tabular-nums">
              Lv.{level.level} {level.smallBlind.toLocaleString()}/{level.bigBlind.toLocaleString()}
            </span>
          ) : (
            <span>接続中…</span>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center px-2">
        {spectating ? (
          <div className="text-center text-ink-400 text-sm py-20">
            現在このテーブルは満席です。観戦モードで状況を確認できます。
          </div>
        ) : (
          <PokerTable
            state={state}
            yourSeatIndex={yourSeatIndex}
            yourCards={yourCards}
            seatCount={SEAT_COUNT}
            revealedHoleCards={revealedHoleCards}
          />
        )}
      </main>

      <AnimatePresence>
        {actionError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-auto mb-2 max-w-md rounded-full bg-rose-500/15 ring-1 ring-rose-500/40 text-rose-300 text-xs px-4 py-1.5 text-center"
          >
            {actionError}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tournamentOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-30 flex items-center justify-center bg-ink-950/90 backdrop-blur px-6"
          >
            <div className="text-center space-y-3">
              <div className="text-gold-500 text-xs tracking-[0.3em]">TOURNAMENT COMPLETE</div>
              <div className="text-2xl font-semibold">
                {tournamentOver.winnerPlayerId === yourSeat?.playerId ? "優勝しました 🏆" : "トーナメント終了"}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!spectating && (
        <ActionBar
          isYourTurn={Boolean(isYourTurn)}
          canCheck={toCall <= 0}
          toCall={toCall}
          minRaiseToAmount={minRaiseToAmount}
          maxRaiseToAmount={maxRaiseToAmount}
          potTotal={state?.potTotal ?? 0}
          streetContribution={yourSeat?.streetContribution ?? 0}
          canRaise={!(yourSeat?.hasActedThisStreet ?? false)}
          onAction={sendAction}
        />
      )}
    </div>
  );
}

export default function Page() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  if (!displayName) return <NameGate onEnter={setDisplayName} />;
  return <GameScreen displayName={displayName} />;
}
