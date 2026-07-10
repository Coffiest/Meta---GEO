"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePokerSocket, type GameKey } from "@/lib/socket";
import { PokerTable } from "@/components/PokerTable";
import { ActionBar } from "@/components/ActionBar";
import { useAuth } from "@/lib/useAuth";
import { useProfile, saveProfile } from "@/lib/profile";
import { LoginScreen } from "@/components/LoginScreen";
import { Onboarding } from "@/components/Onboarding";
import { Lobby } from "@/components/Lobby";
import { BlindStructureSheet } from "@/components/BlindStructureSheet";

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
  onLeave,
  onClose,
}: {
  onShowStructure: () => void;
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
  } = usePokerSocket({ displayName, avatarKey, gameKey, accessToken });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const countdown = useLevelCountdown(levelEndsAt);
  const matchingSecondsLeft = useMatchingCountdown(matching?.secondsLeft ?? null);

  const yourSeat = useMemo(
    () => (yourSeatIndex !== null ? state?.seats.find((s) => s.seatIndex === yourSeatIndex) : undefined),
    [state, yourSeatIndex],
  );

  const isYourTurn = yourSeatIndex !== null && state?.actingSeatIndex === yourSeatIndex && !state.isComplete;
  const toCall = state && yourSeat ? Math.max(0, state.currentBetToMatch - yourSeat.streetContribution) : 0;
  const maxRaiseToAmount = yourSeat ? yourSeat.streetContribution + yourSeat.stack : 0;
  const minRaiseToAmount = state ? Math.min(maxRaiseToAmount, state.currentBetToMatch + state.lastFullRaiseSize) : 0;
  // トーナメントのレベルはハンドの途中で上がることがあるが、進行中のハンドのミニマムベット/
  // bb換算は常にそのハンド開始時点のビッグブラインド(state.bigBlind)を基準にする。
  // 「現在表示中のレベル」のbbで再計算すると、レベルがハンドの途中で上がった瞬間に
  // 最小ベットが1bb未満に見えてしまう(TDAルール: ブラインド変更は次のハンドから適用)。
  const bigBlind = state?.bigBlind ?? level?.bigBlind ?? 0;

  // 公開する手札: ハンド終了後はhandEndedのもの、オールインランアウト中(handEndedより前)は
  // showdownRevealで先にテーブルアップされたものを表示する。
  const shownHoleCards = lastHandEnded?.holeCards ?? runoutHoleCards;
  const revealedHoleCards = shownHoleCards
    ? Object.fromEntries(Object.entries(shownHoleCards).map(([seat, cards]) => [Number(seat), cards]))
    : null;

  return (
    <div className="h-[100dvh] flex flex-col bg-white overflow-hidden">
      <header className="relative flex items-center justify-between gap-2 px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-2 shrink-0">
        {/* 現在のブラインドと次のレベルまでのカウントダウン(常時表示・タップでブラインドストラクチャ表示) */}
        <button
          onClick={() => setStructureOpen(true)}
          className="shrink-0 rounded-xl bg-ink-950 text-white px-3.5 py-2 leading-tight text-left active:scale-[0.97] transition-transform"
        >
          <div className="text-[13px] font-black tabular-nums">
            Lv.{level?.level ?? "-"} {level ? `${level.smallBlind.toLocaleString()}/${level.bigBlind.toLocaleString()}` : ""}
            {level && level.bbAnte > 0 && <span className="text-white/60"> ({level.bbAnte.toLocaleString()})</span>}
          </div>
          <div className="text-[11px] text-white/70 tabular-nums">
            次のレベルまで <span className="text-white font-bold">{countdown}</span>
            {gameKey === "mtt" && <span className="ml-1 text-white/50">MTT</span>}
          </div>
        </button>

        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="shrink-0 h-8 w-8 rounded-full bg-white border border-ink-950 flex items-center justify-center text-ink-800"
          aria-label="設定"
        >
          ⚙
        </button>
        {settingsOpen && (
          <SettingsPopover
            onShowStructure={() => setStructureOpen(true)}
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
            timeBank={!tournamentOver ? timeBank : null}
            onToggleTimeBank={() => timeBank && armTimeBank(!timeBank.armed)}
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
              <div className="text-ink-500 text-xs tracking-[0.3em] font-semibold">TOURNAMENT RESULT</div>
              <div className="text-3xl font-bold text-ink-950">
                {tournamentOver.yourFinishPosition === 1
                  ? "優勝 🏆"
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

      {structureOpen && <BlindStructureSheet currentLevel={level?.level} onClose={() => setStructureOpen(false)} />}

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
          onAction={sendAction}
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
