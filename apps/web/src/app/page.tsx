"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { usePokerSocket, type GameKey, type HandHistoryEntry } from "@/lib/socket";
import { PokerTable } from "@/components/PokerTable";
import { ActionBar } from "@/components/ActionBar";
import { formatSignedBb } from "@/lib/format";
import { useAuth } from "@/lib/useAuth";
import { LoginScreen } from "@/components/LoginScreen";
import { Lobby } from "@/components/Lobby";

const SEAT_COUNT = 6;

const SUIT_BADGE_CLASS: Record<string, string> = {
  s: "bg-navy-500",
  h: "bg-crimson-500",
  d: "bg-azure-500",
  c: "bg-mint-500",
};

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

function HandHistoryPill({ entry, bigBlind }: { entry: HandHistoryEntry; bigBlind: number }) {
  const deltaClass = entry.deltaChips > 0 ? "text-mint-400" : entry.deltaChips < 0 ? "text-crimson-400" : "text-navy-400";
  return (
    <div className="flex items-center gap-1 rounded-full bg-navy-900/80 ring-1 ring-navy-700/50 px-1.5 py-1 shrink-0">
      {entry.cards.map((c, i) => {
        const rank = c.slice(0, -1);
        const suit = c.slice(-1);
        return (
          <span
            key={i}
            className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${SUIT_BADGE_CLASS[suit] ?? "bg-navy-500"}`}
          >
            {rank}
          </span>
        );
      })}
      <span className={`text-[10px] font-medium tabular-nums pr-0.5 ${deltaClass}`}>{formatSignedBb(entry.deltaChips, bigBlind)}</span>
    </div>
  );
}

function SettingsPopover({
  connected,
  level,
  onClose,
}: {
  connected: boolean;
  level: { level: number; smallBlind: number; bigBlind: number } | null;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+44px)] z-50 w-56 rounded-2xl bg-navy-900 ring-1 ring-navy-700 shadow-panel p-3 space-y-3">
        <div className="flex items-center justify-between text-xs text-navy-300">
          <span>接続状況</span>
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-mint-400" : "bg-crimson-500"}`} />
            {connected ? "接続中" : "切断"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-navy-300">
          <span>レベル</span>
          <span className="tabular-nums text-navy-100">
            {level ? `Lv.${level.level} ${level.smallBlind.toLocaleString()}/${level.bigBlind.toLocaleString()}` : "-"}
          </span>
        </div>
        <Link
          href="/geo"
          className="block w-full rounded-xl bg-navy-800 text-navy-100 text-xs font-medium text-center py-2.5 ring-1 ring-navy-600/60 hover:bg-navy-700 transition-colors"
        >
          GEO分析を開く
        </Link>
      </div>
    </>
  );
}

function GameScreen({
  displayName,
  gameKey,
  accessToken,
}: {
  displayName: string;
  gameKey: GameKey;
  accessToken?: string;
}) {
  const {
    connected,
    spectating,
    state,
    yourSeatIndex,
    yourCards,
    lastHandEnded,
    level,
    tournamentOver,
    actionError,
    players,
    handHistory,
    lastActionBySeat,
    lastHandDeltaBySeat,
    joinError,
    sendAction,
  } = usePokerSocket({ displayName, gameKey, accessToken });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const yourSeat = useMemo(
    () => (yourSeatIndex !== null ? state?.seats.find((s) => s.seatIndex === yourSeatIndex) : undefined),
    [state, yourSeatIndex],
  );

  const isYourTurn = yourSeatIndex !== null && state?.actingSeatIndex === yourSeatIndex && !state.isComplete;
  const toCall = state && yourSeat ? Math.max(0, state.currentBetToMatch - yourSeat.streetContribution) : 0;
  const maxRaiseToAmount = yourSeat ? yourSeat.streetContribution + yourSeat.stack : 0;
  const minRaiseToAmount = state ? Math.min(maxRaiseToAmount, state.currentBetToMatch + state.lastFullRaiseSize) : 0;
  const bigBlind = level?.bigBlind ?? 0;

  const revealedHoleCards = lastHandEnded
    ? Object.fromEntries(Object.entries(lastHandEnded.holeCards).map(([seat, cards]) => [Number(seat), cards]))
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-navy-950">
      <header className="relative flex items-center justify-between gap-2 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {handHistory.map((entry, i) => (
            <HandHistoryPill key={i} entry={entry} bigBlind={bigBlind} />
          ))}
        </div>
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="shrink-0 h-8 w-8 rounded-full bg-navy-900/80 ring-1 ring-navy-700/50 flex items-center justify-center text-navy-300"
          aria-label="設定"
        >
          ⚙
        </button>
        {settingsOpen && (
          <SettingsPopover connected={connected} level={level} onClose={() => setSettingsOpen(false)} />
        )}
      </header>

      <main className="flex-1 flex flex-col justify-center px-2">
        {spectating ? (
          <div className="text-center text-navy-400 text-sm py-20">
            現在このテーブルは満席です。観戦モードで状況を確認できます。
          </div>
        ) : (
          <PokerTable
            state={state}
            yourSeatIndex={yourSeatIndex}
            yourCards={yourCards}
            seatCount={SEAT_COUNT}
            revealedHoleCards={revealedHoleCards}
            players={players}
            bigBlind={bigBlind}
            lastActionBySeat={lastActionBySeat}
            lastHandDeltaBySeat={lastHandDeltaBySeat}
          />
        )}
      </main>

      <AnimatePresence>
        {(actionError || joinError) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-auto mb-2 max-w-md rounded-full bg-crimson-500/15 ring-1 ring-crimson-500/40 text-crimson-300 text-xs px-4 py-1.5 text-center"
          >
            {actionError ?? joinError}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tournamentOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-30 flex items-center justify-center bg-navy-950/90 backdrop-blur px-6"
          >
            <div className="text-center space-y-3">
              <div className="text-gold-500 text-xs tracking-[0.3em]">TOURNAMENT COMPLETE</div>
              <div className="text-2xl font-semibold text-navy-100">
                {tournamentOver.winnerPlayerId === yourSeat?.playerId ? "優勝しました 🏆" : "トーナメント終了"}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!spectating && (
        <ActionBar
          isYourTurn={Boolean(isYourTurn)}
          street={state?.street ?? "preflop"}
          canCheck={toCall <= 0}
          toCall={toCall}
          minRaiseToAmount={minRaiseToAmount}
          maxRaiseToAmount={maxRaiseToAmount}
          potTotal={state?.potTotal ?? 0}
          streetContribution={yourSeat?.streetContribution ?? 0}
          canRaise={!(yourSeat?.hasActedThisStreet ?? false)}
          bigBlind={bigBlind}
          onAction={sendAction}
        />
      )}
    </div>
  );
}

function LoadingScreen() {
  return <div className="min-h-screen flex items-center justify-center bg-navy-950 text-navy-400 text-sm">読み込み中…</div>;
}

export default function Page() {
  const auth = useAuth();
  const [guestName, setGuestName] = useState<string | null>(null);
  const [gameKey, setGameKey] = useState<GameKey | null>(null);

  // Supabaseが設定されている(本番想定): ログイン必須で、ロビー→プレイの流れにする。
  if (auth.authAvailable) {
    if (auth.loading) return <LoadingScreen />;
    if (!auth.session) return <LoginScreen auth={auth} />;

    const displayName =
      (auth.session.user.user_metadata?.["displayName"] as string | undefined) ??
      auth.session.user.email?.split("@")[0] ??
      "Player";

    if (!gameKey) {
      return (
        <Lobby
          auth={auth}
          displayName={displayName}
          onJoin={setGameKey}
          onSignOut={() => {
            setGameKey(null);
            void auth.signOut();
          }}
        />
      );
    }

    return <GameScreen displayName={displayName} gameKey={gameKey} accessToken={auth.session.access_token} />;
  }

  // Supabase未設定のローカル開発用フォールバック: 表示名入力→ロビー(スタッツ無し)→プレイ。
  if (!guestName) return <NameGate onEnter={setGuestName} />;
  if (!gameKey) return <Lobby auth={auth} displayName={guestName} onJoin={setGameKey} />;
  return <GameScreen displayName={guestName} gameKey={gameKey} />;
}
