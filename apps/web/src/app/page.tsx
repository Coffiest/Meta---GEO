"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePokerSocket, type GameKey, type SeatPlayerInfo } from "@/lib/socket";
import { PokerTable } from "@/components/PokerTable";
import { ActionBar } from "@/components/ActionBar";
import { useAuth } from "@/lib/useAuth";
import { useProfile, saveProfile } from "@/lib/profile";
import { LoginScreen } from "@/components/LoginScreen";
import { Onboarding } from "@/components/Onboarding";
import { Lobby } from "@/components/Lobby";
import { BlindStructureSheet } from "@/components/BlindStructureSheet";
import { GameHandHistorySheet } from "@/components/GameHandHistorySheet";
import { PlayerDetailModal } from "@/components/PlayerDetailModal";
import { fetchPlayerNotes, PLAYER_NOTE_COLOR_HEX, type PlayerNoteColor } from "@/lib/playerNotes";

const SEAT_COUNT = 6;

/** 次のレベルまでの残り時間(mm:ss)。毎秒更新。 */
function useLevelCountdown(endsAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return "--:--";
  const remaining = Math.max(0, endsAt - now);
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * SNGマッチング待合室の残り秒数。サーバーは待合人数が変わった時だけ`secondsLeft`を送ってくるため、
 * 受信時点の値を元にした締切時刻(endsAt)を基準にクライアント側で毎秒カウントダウンする。
 */
function useMatchingCountdown(secondsLeft: number | null): number | null {
  const [endsAt, setEndsAt] = useState<number | null>(secondsLeft !== null ? Date.now() + secondsLeft * 1000 : null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setEndsAt(secondsLeft !== null ? Date.now() + secondsLeft * 1000 : null);
    setNow(Date.now());
  }, [secondsLeft]);

  useEffect(() => {
    if (endsAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  if (endsAt === null) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

function SettingsPopover({
  onShowStructure,
  onShowHistory,
  onLeave,
  onClose,
}: {
  onShowStructure: () => void;
  onShowHistory: () => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+44px)] z-50 w-60 rounded-2xl bg-white border border-ink-950 p-2 space-y-1">
        <button
          onClick={() => {
            onClose();
            onShowHistory();
          }}
          className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-ink-900 hover:bg-ink-100 transition-colors"
        >
          このゲームのハンド履歴
        </button>
        <button
          onClick={() => {
            onClose();
            onShowStructure();
          }}
          className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-ink-900 hover:bg-ink-100 transition-colors"
        >
          ブラインドストラクチャを見る
        </button>
        {confirmingLeave ? (
          <div className="rounded-xl bg-ink-100 p-3 space-y-2">
            <p className="text-xs text-ink-600">チップを破棄して離脱します。この操作は取り消せません。</p>
            <div className="flex gap-2">
              <button
                onClick={onLeave}
                className="flex-1 rounded-lg bg-crimson-500 text-white text-xs font-semibold py-2 active:scale-[0.97] transition-transform"
              >
                離脱する
              </button>
              <button
                onClick={() => setConfirmingLeave(false)}
                className="flex-1 rounded-lg bg-ink-200 text-ink-800 text-xs py-2"
              >
                やめる
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingLeave(true)}
            className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-crimson-500 hover:bg-ink-100 transition-colors"
          >
            チップを破棄してゲームから離脱
          </button>
        )}
      </div>
    </>
  );
}

function GameScreen({
  displayName,
  avatarKey,
  gameKey,
  accessToken,
  onExit,
}: {
  displayName: string;
  avatarKey: string | null;
  gameKey: GameKey;
  accessToken?: string;
  onExit: () => void;
}) {
  const {
    spectating,
    state,
    yourSeatIndex,
    yourCards,
    lastHandEnded,
    level,
    levelEndsAt,
    tournamentInfo,
    tournamentOver,
    actionError,
    players,
    lastActionBySeat,
    lastHandDeltaBySeat,
    turnTimer,
    timeBank,
    matching,
    waiting,
    joinError,
    runoutHoleCards,
    sendAction,
    leaveGame,
    armTimeBank,
    setAway,
    gameHandHistory,
  } = usePokerSocket({ displayName, avatarKey, gameKey, accessToken });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tappedPlayer, setTappedPlayer] = useState<SeatPlayerInfo | null>(null);
  // 各相手のマーキング色(HEX)。userId→HEX。テーブルの席ドット表示用。
  const [markingBySeat, setMarkingBySeat] = useState<Record<string, string | null>>({});
  const countdown = useLevelCountdown(levelEndsAt);
  const matchingSecondsLeft = useMatchingCountdown(matching?.secondsLeft ?? null);

  const yourSeat = useMemo(
    () => (yourSeatIndex !== null ? state?.seats.find((s) => s.seatIndex === yourSeatIndex) : undefined),
    [state, yourSeatIndex],
  );

  // 着席中の相手(非BOT)のマーキングをまとめて取得し、テーブルの席ドットに反映する。
  const opponentUserIds = useMemo(
    () =>
      Object.values(players)
        .filter((p) => !p.isBot && Boolean(p.userId))
        .map((p) => p.userId),
    [players],
  );
  const opponentIdsKey = opponentUserIds.join(",");
  useEffect(() => {
    if (!accessToken || opponentUserIds.length === 0) return;
    let alive = true;
    void fetchPlayerNotes(accessToken, opponentUserIds).then((map) => {
      if (!alive) return;
      const hexMap: Record<string, string | null> = {};
      for (const [uid, n] of Object.entries(map)) {
        hexMap[uid] = n.color ? PLAYER_NOTE_COLOR_HEX[n.color] : null;
      }
      setMarkingBySeat((prev) => ({ ...prev, ...hexMap }));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, opponentIdsKey]);

  const handleMarkingSaved = (userId: string, color: PlayerNoteColor | null) => {
    setMarkingBySeat((prev) => ({ ...prev, [userId]: color ? PLAYER_NOTE_COLOR_HEX[color] : null }));
  };

  const isYourTurn = yourSeatIndex !== null && state?.actingSeatIndex === yourSeatIndex && !state.isComplete;
  const toCall = state && yourSeat ? Math.max(0, state.currentBetToMatch - yourSeat.streetContribution) : 0;
  const maxRaiseToAmount = yourSeat ? yourSeat.streetContribution + yourSeat.stack : 0;
  const minRaiseToAmount = state ? Math.min(maxRaiseToAmount, state.currentBetToMatch + state.lastFullRaiseSize) : 0;
  // トーナメントのレベルはハンドの途中で上がることがあるが、進行中のハンドのミニマムベット/
  // bb換算は常にそのハンド開始時点のビッグブラインド(state.bigBlind)を基準にする。
  // 「現在表示中のレベル」のbbで再計算すると、レベルがハンドの途中で上がった瞬間に
  // 最小ベットが1bb未満に見えてしまう(TDAルール: ブラインド変更は次のハンドから適用)。
  const bigBlind = state?.bigBlind ?? level?.bigBlind ?? 0;

  // エフェクティブスタック(まだ賭けられる有効スタック)= ハンドに残っている全アクティブ
  // プレイヤーのうち最小の残りスタック。ジオメトリックサイズはこの値を基準に計算する。
  const activeStacksBehind = (state?.seats ?? []).filter((s) => s.status === "active").map((s) => s.stack);
  const effectiveStackBehind = activeStacksBehind.length ? Math.min(...activeStacksBehind) : yourSeat?.stack ?? 0;

  // 公開する手札: ハンド終了後はhandEndedのもの、オールインランアウト中(handEndedより前)は
  // showdownRevealで先にテーブルアップされたものを表示する。
  const shownHoleCards = lastHandEnded?.holeCards ?? runoutHoleCards;
  const revealedHoleCards = shownHoleCards
    ? Object.fromEntries(Object.entries(shownHoleCards).map(([seat, cards]) => [Number(seat), cards]))
    : null;

  return (
    <div className="h-[100dvh] flex flex-col bg-white overflow-hidden">
      <header className="relative flex items-center justify-between gap-2 px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-2 shrink-0">
        {/* 現在のブラインドと次のレベルまでのカウントダウン(常時表示・タップでブラインドストラクチャ表示)。
            Swissらしくマイクロラベル(uppercase・字間広め)+大きめ数字のタイポグラフィ階層で構成。 */}
        <button
          onClick={() => setStructureOpen(true)}
          className="shrink-0 rounded-xl bg-white text-ink-950 border border-ink-950 pl-3 pr-3.5 py-2 text-left active:scale-[0.97] transition-transform"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[9px] font-black tracking-[0.16em] text-ink-400 uppercase tabular-nums">Lv.{level?.level ?? "-"}</span>
            <span className="text-[14px] font-black tabular-nums leading-none text-ink-950">
              {level ? `${level.smallBlind.toLocaleString()}/${level.bigBlind.toLocaleString()}` : "—"}
            </span>
            {level && level.bbAnte > 0 && (
              <span className="text-[10px] font-bold text-ink-500 tabular-nums leading-none">ANTE {level.bbAnte.toLocaleString()}</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] tabular-nums">
            <span className="font-bold tracking-[0.14em] text-ink-400 uppercase">Next</span>
            <span className="font-black text-ink-950">{countdown}</span>
            {gameKey === "mtt" && <span className="ml-1 rounded bg-ink-950 px-1 py-[1px] text-[8px] font-black tracking-widest text-white">MTT</span>}
          </div>
        </button>

        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="shrink-0 h-9 w-9 rounded-full bg-white border border-ink-950 flex items-center justify-center text-ink-800 active:scale-95 transition-transform"
          aria-label="設定"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-[18px] w-[18px]">
            <circle cx="12" cy="12" r="3.2" />
            <path
              d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {settingsOpen && (
          <SettingsPopover
            onShowStructure={() => setStructureOpen(true)}
            onShowHistory={() => setHistoryOpen(true)}
            onLeave={() => {
              leaveGame();
              onExit();
            }}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </header>

      <main className="flex-1 min-h-0 flex flex-col justify-center px-2 overflow-hidden">
        {spectating ? (
          <div className="text-center text-ink-500 text-sm py-20">
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
            turnTimer={turnTimer}
            onPlayerTap={(info) => setTappedPlayer(info)}
            markingBySeat={markingBySeat}
          />
        )}
      </main>

      {/* SNGマッチング待合室 / MTT開始待ち(4人揃うまで)。右下にトースト風に表示する */}
      <AnimatePresence>
        {(matching || waiting) && !state && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] right-4 z-30 w-56 rounded-2xl bg-white border border-ink-950 p-3.5"
          >
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full border-2 border-ink-950 border-t-transparent animate-spin" />
              <div className="text-xs font-semibold text-ink-950">
                {matching?.starting ? "まもなく開始します…" : matching ? "マッチング中…" : "開始まで待機中…"}
              </div>
            </div>
            <div className="text-[11px] text-ink-600 mt-1.5">
              {matching ? `${matching.registered} / ${matching.needed} 人集まりました` : `${waiting!.registered} / ${waiting!.needed} 人登録済み`}
            </div>
            {matchingSecondsLeft !== null && !matching?.starting && (
              <div className="text-[11px] text-ink-500 mt-0.5">残り{matchingSecondsLeft}秒でBOTが自動補充されます</div>
            )}
            {waiting && <div className="text-[11px] text-ink-500 mt-0.5">4人集まり次第すぐに開始します</div>}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(actionError || joinError) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-auto mb-2 max-w-md rounded-full bg-crimson-500/10 ring-1 ring-crimson-500/40 text-crimson-600 text-xs px-4 py-1.5 text-center"
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
            className="fixed inset-0 z-30 flex items-center justify-center bg-white/95 backdrop-blur px-6"
          >
            <div className="text-center space-y-4">
              {tournamentOver.yourFinishPosition === 1 && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="mx-auto h-10 w-10 text-gold-500">
                  <path d="M7 4h10v4.5a5 5 0 0 1-10 0V4Z" />
                  <path d="M7 5.4H4.4A2.6 2.6 0 0 0 7 8.6M17 5.4h2.6A2.6 2.6 0 0 1 17 8.6" />
                  <path d="M12 13.5v3.5M8.5 21h7M9.5 21v-1.2a2.5 2.5 0 0 1 5 0V21" />
                </svg>
              )}
              <div className="text-ink-500 text-xs tracking-[0.3em] font-semibold">TOURNAMENT RESULT</div>
              <div className="text-3xl font-bold text-ink-950">
                {tournamentOver.yourFinishPosition === 1
                  ? "優勝"
                  : tournamentOver.yourFinishPosition !== null
                    ? `${tournamentOver.yourFinishPosition}位`
                    : "トーナメント終了"}
              </div>
              {tournamentOver.yourPayout > 0 && (
                <div className="text-mint-600 text-lg font-semibold tabular-nums">賞金 +{tournamentOver.yourPayout.toLocaleString()}</div>
              )}
              <button
                onClick={onExit}
                className="mt-2 rounded-xl bg-ink-950 text-white text-sm font-semibold px-8 py-3 active:scale-[0.97] transition-transform"
              >
                ロビーへ戻る
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {structureOpen && (
        <BlindStructureSheet
          currentLevel={level?.level}
          level={level}
          levelEndsAt={levelEndsAt}
          tournamentInfo={tournamentInfo}
          gameLabel={gameKey === "mtt" ? "MTT トーナメント" : "Sit & Go"}
          onClose={() => setStructureOpen(false)}
        />
      )}

      <AnimatePresence>
        {historyOpen && (
          <GameHandHistorySheet records={gameHandHistory} bigBlind={bigBlind} onClose={() => setHistoryOpen(false)} />
        )}
      </AnimatePresence>

      {/* 相手タップで開くプレイヤー詳細モーダル(スタッツ+偏差値+5色マーキング+メモ)。 */}
      <AnimatePresence>
        {tappedPlayer && (
          <PlayerDetailModal
            target={{ userId: tappedPlayer.userId, displayName: tappedPlayer.displayName, avatarKey: tappedPlayer.avatarKey, isBot: tappedPlayer.isBot }}
            accessToken={accessToken}
            onClose={() => setTappedPlayer(null)}
            onSaved={handleMarkingSaved}
          />
        )}
      </AnimatePresence>

      {!spectating && !tournamentOver && (
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
          effectiveStackBehind={effectiveStackBehind}
          onAction={sendAction}
          timeBank={timeBank}
          onToggleTimeBank={() => timeBank && armTimeBank(!timeBank.armed)}
          onToggleAway={setAway}
        />
      )}
    </div>
  );
}

function LoadingScreen() {
  return <div className="min-h-screen flex items-center justify-center bg-ink-50 text-ink-700 text-sm">読み込み中…</div>;
}

export default function Page() {
  const auth = useAuth();
  const accessToken = auth.session?.access_token;
  const { profile, loading: profileLoading, reload } = useProfile(accessToken);
  const [editingProfile, setEditingProfile] = useState(false);
  const [gameKey, setGameKey] = useState<GameKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ゲストプレイは廃止。ログインなしでは常にログイン画面より先に進めない。
  if (!auth.authAvailable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50 text-ink-700 text-sm px-6 text-center">
        ログイン機能が設定されていません。管理者にお問い合わせください。
      </div>
    );
  }

  if (auth.loading) return <LoadingScreen />;
  if (!auth.session) return <LoginScreen auth={auth} />;
  if (profileLoading) return <LoadingScreen />;
  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-ink-50 px-6">
        <p className="text-sm text-ink-800">プロフィールの取得に失敗しました。</p>
        <button onClick={() => void reload()} className="rounded-xl bg-mint-500 text-white text-sm font-semibold px-6 py-2.5">
          再試行
        </button>
      </div>
    );
  }

  // 名前とアバターを決めるまでは、ホームには一切進めない(この分岐が常に先に評価される)。
  if (!profile.onboarded || editingProfile) {
    return (
      <Onboarding
        title={profile.onboarded ? "プロフィールを編集" : "プロフィールを設定"}
        initialName={profile.onboarded ? profile.displayName : ""}
        initialAvatarKey={profile.avatarKey}
        submitLabel={profile.onboarded ? "保存する" : "はじめる"}
        saving={saving}
        error={saveError}
        onSubmit={(params) => {
          setSaving(true);
          setSaveError(null);
          void saveProfile(accessToken!, params).then(async (saved) => {
            if (!saved) setSaveError("保存に失敗しました。もう一度お試しください。");
            else await reload();
            setSaving(false);
            setEditingProfile(false);
          });
        }}
        onCancel={profile.onboarded ? () => setEditingProfile(false) : undefined}
      />
    );
  }

  if (gameKey) {
    return (
      <GameScreen
        displayName={profile.displayName}
        avatarKey={profile.avatarKey}
        gameKey={gameKey}
        accessToken={accessToken}
        onExit={() => setGameKey(null)}
      />
    );
  }

  // ログイン中アカウントに紐付いているプロバイダ一覧(例: ["google"], ["apple", "google"])。
  // 同一メールのApple/GoogleはSupabaseが同一アカウントに統合するため、複数表示されることがある。
  const providers =
    (auth.session.user.app_metadata?.["providers"] as string[] | undefined) ??
    (auth.session.user.app_metadata?.provider ? [auth.session.user.app_metadata.provider] : []);

  return (
    <Lobby
      displayName={profile.displayName}
      avatarKey={profile.avatarKey}
      email={profile.email}
      providers={providers}
      userId={profile.id}
      accessToken={accessToken}
      onJoin={setGameKey}
      onEditProfile={() => setEditingProfile(true)}
      onSignOut={() => {
        setGameKey(null);
        void auth.signOut();
      }}
    />
  );
}
