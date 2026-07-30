"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { usePokerSocket, type GameKey, type SeatPlayerInfo, type SocketDiag, type TournamentOverInfo } from "@/lib/socket";
import { PokerTable } from "@/components/PokerTable";
import { ActionBar } from "@/components/ActionBar";
import { useAuth } from "@/lib/useAuth";
import { useProfile, saveProfile } from "@/lib/profile";
import { capturePendingReferralCode, redeemReferral, takePendingReferralCode } from "@/lib/referral";
import { LoginScreen } from "@/components/LoginScreen";
import { Onboarding } from "@/components/Onboarding";
import { Lobby } from "@/components/Lobby";
import { BlindStructureSheet } from "@/components/BlindStructureSheet";
import { TournamentResultScreen, fetchResultSnapshot, type ResultStatsSnapshot } from "@/components/TournamentResultScreen";
import { GameHandHistorySheet } from "@/components/GameHandHistorySheet";
import { ChatLogSheet } from "@/components/ChatLogSheet";
import { PlayerDetailModal } from "@/components/PlayerDetailModal";
import { WelcomeTour, hasTourBeenSeen } from "@/components/WelcomeTour";
import { fetchPlayerNotes, PLAYER_NOTE_COLOR_HEX, type PlayerNoteColor } from "@/lib/playerNotes";
import { useI18n } from "@/lib/i18n";

const SEAT_COUNT = 6;

/**
 * 進行停止(フリーズ)の原因分類コード→ユーザー向けのタイトル/説明。
 * コードは socket.ts の classifyStall が判定する。スクリーンショットから原因を特定できるよう、
 * オーバーレイにはこの文言と合わせてコードそのもの・通信診断の詳細も表示する。
 */
const STALL_INFO: Record<string, { title: string; body: string }> = {
  "F-OFFLINE": {
    title: "インターネット接続がオフラインです",
    body: "端末の通信環境(Wi-Fi/モバイル回線)をご確認ください。回線が戻り次第、自動で卓へ復帰します。",
  },
  "F-DISCONNECTED": {
    title: "サーバーとの接続が切れています",
    body: "自動で再接続しています…。長く続く場合は通信環境をご確認ください。",
  },
  "F-ZOMBIE": {
    title: "サーバーからの応答が途絶えています",
    body: "接続は維持されていますがデータが届いていません。接続を作り直して再同期しています…",
  },
  "F-NO-PROGRESS": {
    title: "サーバー側で卓の進行が止まっています",
    body: "通信は生きていますが、盤面の更新が届いていません。サーバーへ再同期を要求しています…",
  },
  "F-NEXT-HAND": {
    title: "次のハンドの開始が遅れています",
    body: "サーバーの応答待ちです。自動で再同期を試みています…(数秒お待ちください)",
  },
  "F-TURN-EXPIRED": {
    title: "手番の時間切れ処理が行われていません",
    body: "手番タイマーの期限を過ぎてもサーバーが進行を処理していません。再同期しています…",
  },
};

/** 診断表示用: タイムスタンプを「N秒前」表記にする(未記録は「なし」)。 */
function diagAgo(ts: number | null, now: number): string {
  if (ts === null) return "なし";
  return `${Math.max(0, Math.round((now - ts) / 1000))}秒前`;
}

/**
 * 停止オーバーレイの通信診断詳細。原因コード・接続状態・各種イベントの最終受信時刻・
 * 直近アクションのACK状況を等幅で列挙し、スクリーンショット1枚で原因を切り分けられるようにする。
 */
function StallDiagDetails({ diag, connected }: { diag: SocketDiag; connected: boolean }) {
  const now = Date.now();
  const act = diag.lastAction;
  const actLine = act
    ? `${act.kind} ${diagAgo(act.sentAt, now)}送信 → ${
        act.status === "pending"
          ? "応答待ち"
          : act.status === "timeout"
            ? "応答なし(タイムアウト)"
            : act.status === "unsent"
              ? "未接続で送信不可"
              : `受領 ${act.ackCode ?? "OK"}(${act.ackElapsedMs ?? 0}ms)`
      }`
    : "なし";
  const lines: [string, string][] = [
    ["コード", diag.stallReason ?? "-"],
    [
      "接続",
      connected
        ? "接続中"
        : `切断(${diag.disconnectReason ?? "理由不明"}${diag.connectErrorMessage ? ` / ${diag.connectErrorMessage}` : ""})`,
    ],
    ["最終受信", `${diagAgo(diag.lastEventAt, now)}${diag.lastEventName ? `(${diag.lastEventName})` : ""}`],
    ["盤面更新", diagAgo(diag.lastStateAt, now)],
    ["手番通知", diagAgo(diag.lastTurnTimerAt, now)],
    ["ハンド終了", diagAgo(diag.lastHandEndedAt, now)],
    ["再同期", `${diag.resyncCount}回 / 再接続試行 ${diag.reconnectAttempts}回`],
    ["アクション", actLine],
  ];
  return (
    <div className="mt-2 rounded-lg bg-ink-950/[0.04] px-2.5 py-2 font-mono text-[10px] leading-relaxed text-ink-500">
      {lines.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="w-16 shrink-0 text-ink-400">{k}</span>
          <span className="min-w-0 break-all">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** 残り時間をmm:ssに整形する(endsAtが無ければ "--:--")。 */
function formatCountdown(endsAt: number | null, now: number): string {
  if (!endsAt) return "--:--";
  const remaining = Math.max(0, endsAt - now);
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 毎秒更新のカウントダウン表示。
 *
 * 重要: 毎秒のsetStateを親(GameScreen)に持たせると、テーブル・全席・framer-motionの
 * ツリー全体が1秒ごとに再描画され、スマートフォンが発熱する原因になる。
 * 秒針を持つのはこの葉コンポーネントだけに閉じ込め、再描画をテキスト1つに限定する。
 */
function CountdownText({ endsAt, className }: { endsAt: number | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  return <span className={className}>{formatCountdown(endsAt, now)}</span>;
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
  onShowChatLog,
  onLeave,
  onClose,
}: {
  onShowStructure: () => void;
  onShowHistory: () => void;
  onShowChatLog: () => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
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
          className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-ink-900 hover:bg-ink-100 transition-[background-color,transform] active:scale-[0.98]"
        >
          {t("settings.handHistory")}
        </button>
        <button
          onClick={() => {
            onClose();
            onShowStructure();
          }}
          className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-ink-900 hover:bg-ink-100 transition-[background-color,transform] active:scale-[0.98]"
        >
          {t("settings.blindStructure")}
        </button>
        <button
          onClick={() => {
            onClose();
            onShowChatLog();
          }}
          className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-ink-900 hover:bg-ink-100 transition-[background-color,transform] active:scale-[0.98]"
        >
          {t("settings.chatLog")}
        </button>
        {confirmingLeave ? (
          <div className="rounded-xl bg-ink-100 p-3 space-y-2">
            <p className="text-xs text-ink-600">{t("settings.leaveConfirm")}</p>
            <div className="flex gap-2">
              <button
                onClick={onLeave}
                className="flex-1 rounded-lg bg-crimson-500 text-white text-xs font-semibold py-2 active:scale-[0.97] transition-transform"
              >
                {t("settings.leaveDo")}
              </button>
              <button
                onClick={() => setConfirmingLeave(false)}
                className="flex-1 rounded-lg bg-ink-200 text-ink-800 text-xs py-2"
              >
                {t("settings.leaveCancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingLeave(true)}
            className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-crimson-500 hover:bg-ink-100 transition-[background-color,transform] active:scale-[0.98]"
          >
            {t("settings.leave")}
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
    connected,
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
    tableNotice,
    stalled,
    diag,
    gameGone,
    sendAction,
    resync,
    leaveGame,
    armTimeBank,
    setAway,
    sendChat,
    showCards,
    reEntry,
    chatLog,
    seatBubbles,
    gameHandHistory,
  } = usePokerSocket({ displayName, avatarKey, gameKey, accessToken });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatLogOpen, setChatLogOpen] = useState(false);
  const [chatInputOpen, setChatInputOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [tappedPlayer, setTappedPlayer] = useState<SeatPlayerInfo | null>(null);
  // ゲーム開始時点のスタッツ(結果画面でbefore→afterの増減を表示するため)。一度だけ取得。
  const [statsBefore, setStatsBefore] = useState<ResultStatsSnapshot | null>(null);
  // 「チップを破棄して離脱」した場合、その場で敗退とみなして表示するトーナメント結果。
  // 通常のtournamentOverと同じ結果画面を、着順=離脱時点の残り人数・賞金0で表示する。
  const [leftResult, setLeftResult] = useState<TournamentOverInfo | null>(null);
  // 各相手のマーキング色(HEX)。userId→HEX。テーブルの席ドット表示用。
  const [markingBySeat, setMarkingBySeat] = useState<Record<string, string | null>>({});
  // ハンドショウ: 自分の手札をハンド終了時に公開する意思(自席のカードをタップでトグル)。
  const [heroShowIntent, setHeroShowIntent] = useState(false);
  const matchingSecondsLeft = useMatchingCountdown(matching?.secondsLeft ?? null);
  // レジストレーションクローズの締切時刻(MTT・RC前のみ)。表示はCountdownTextに任せる。
  const regClosesAt =
    gameKey === "mtt" && !tournamentInfo?.registrationClosed ? tournamentInfo?.registrationClosesAt ?? null : null;
  // 注意: 再接続で進行中の卓が見つからなくても、絶対にホームへ強制退出させない(プレイ中に突然
  // ロビーへ戻される致命バグの再発防止)。再接続時は resumeGame で自動的に卓へ復帰する。
  // そのうえで、卓が本当に消えている(サーバー再起動やセッション終了)場合に画面が固まったまま
  // 何も操作できなくなるのを防ぐため、案内と「ホームへ戻る」導線だけを出す(強制退出はしない)。
  // 盤面(state)が届けば socket 側で自動的に解除されるため、一時的な再接続では出ない。
  const showGameGone = gameGone && !tournamentOver && !leftResult && !matching && !waiting;

  const yourSeat = useMemo(
    () => (yourSeatIndex !== null ? state?.seats.find((s) => s.seatIndex === yourSeatIndex) : undefined),
    [state, yourSeatIndex],
  );

  // 着席中の相手のマーキングをまとめて取得し、テーブルの席ドットに反映する
  // (自動プレイヤーも通常プレイヤーと同様に扱い、マーキングを表示できるようにする)。
  const opponentUserIds = useMemo(
    () =>
      Object.values(players)
        .filter((p) => Boolean(p.userId))
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

  // ゲーム開始時点のスタッツを一度だけ取得(結果画面の増減表示のbaseline)。
  useEffect(() => {
    if (!accessToken || statsBefore) return;
    void fetchResultSnapshot(accessToken).then((snap) => {
      if (snap) setStatsBefore(snap);
    });
  }, [accessToken, statsBefore]);

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

  // 敗退した瞬間に結果画面で卓を覆ってしまうと、自分が飛んだそのハンドの相手の手札を
  // 見られないまま終わる(特にオールイン勝負のショーダウン)。結果画面は少し待ってから出し、
  // その間は卓とショーダウンを見せる。待てない人のために「結果を見る」ボタンも同時に出す。
  const SHOWDOWN_GRACE_MS = 6000;
  const BUST_GRACE_MS = 1500;
  const [resultReady, setResultReady] = useState(false);
  useEffect(() => {
    if (!tournamentOver) {
      setResultReady(false);
      return;
    }
    // 公開された手札があるハンドで飛んだときだけ長めに見せる(フォールド決着なら見るものが無い)。
    const hadShowdown = Boolean(shownHoleCards && Object.keys(shownHoleCards).length > 0);
    const timer = setTimeout(() => setResultReady(true), hadShowdown ? SHOWDOWN_GRACE_MS : BUST_GRACE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentOver]);

  /** 敗退したが、まだショーダウンを見せている最中か。 */
  const resultPending = Boolean(tournamentOver) && !resultReady;

  // ハンドが終わったら次のハンドのためにショウ意思をリセットする(サーバー側も毎ハンド初期化)。
  useEffect(() => {
    if (lastHandEnded) setHeroShowIntent(false);
  }, [lastHandEnded]);

  // 自席のカードをタップしてショウ意思をトグルし、サーバーへ通知する。
  const toggleHeroShow = useCallback(() => {
    setHeroShowIntent((prev) => {
      const next = !prev;
      showCards(next);
      return next;
    });
  }, [showCards]);

  return (
    <div className="relative isolate h-[100dvh] flex flex-col bg-white overflow-hidden">
      {/* テーブル(黒縁)の外側に敷く背景パターン。元画像は黒地+白線のため、
          grayscale+invertで「白地+黒線」に変換し、低不透明度で薄い灰色の柄として馴染ませる。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: "url(/table/bg-pattern.jpeg)",
          backgroundSize: "380px auto",
          backgroundRepeat: "repeat",
          filter: "grayscale(1) invert(1)",
          opacity: 0.14,
          // 発熱対策: 独立した合成レイヤーへ昇格させ、grayscale+invertのフィルタを
          // 1度だけラスタライズしてキャッシュさせる(毎フレーム再適用させない)。
          transform: "translateZ(0)",
          willChange: "transform",
        }}
      />
      <header className="relative flex items-center justify-between gap-2 px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-2 shrink-0">
        {/* 現在のブラインドと次のレベルまでのカウントダウン(常時表示・タップでブラインドストラクチャ表示)。
            Swissらしくマイクロラベル(uppercase・字間広め)+大きめ数字のタイポグラフィ階層で構成。 */}
        {/* ブラインドタイマー(トーナメントクロック)を縮小したミニ版。クロック画面と同じ意匠で、
            gold-600の大きなカウントダウンを主役に、LEVEL・BLIND・ANTEをマイクロラベル付きで並べる。 */}
        <button
          onClick={() => setStructureOpen(true)}
          className="shrink-0 rounded-xl bg-white text-ink-950 border border-ink-950 px-3 py-1.5 text-left active:scale-[0.97] transition-transform"
        >
          <div className="flex items-center gap-1.5 leading-none">
            <span className="text-[8px] font-black uppercase tracking-[0.22em] text-gold-600 tabular-nums">Lv {level?.level ?? "-"}</span>
            {gameKey === "mtt" && (
              <span className="rounded bg-ink-950 px-1 py-[1px] text-[7px] font-black tracking-widest text-white">MTT</span>
            )}
            {tournamentInfo?.isFinalTable && (
              <span className="rounded bg-gold-500 px-1 py-[1px] text-[7px] font-black tracking-widest text-ink-950">FINAL TABLE</span>
            )}
          </div>
          <CountdownText
            endsAt={levelEndsAt}
            className="mt-0.5 block text-[26px] font-black tabular-nums leading-none text-gold-600"
          />
          {/* 生存者数(MTT)。「生存者/エントリー」を1つの分数としてコンパクトに出す(例: 10/12)。 */}
          {gameKey === "mtt" && tournamentInfo && (
            <div className="mt-1 flex items-baseline gap-1 leading-none">
              {/* プレイヤー(人数)アイコン。絵文字禁止のためSVG。 */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 self-center text-ink-700">
                <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
                <circle cx="10" cy="8" r="3.2" />
                <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 5.1a3.2 3.2 0 0 1 0 6" />
              </svg>
              <span className="text-[16px] font-black tabular-nums leading-none text-ink-950">
                {tournamentInfo.remaining}
                <span className="text-ink-400">/</span>
                {tournamentInfo.total}
              </span>
              <span className="text-[7px] font-black uppercase tracking-[0.18em] text-ink-600">残り</span>
            </div>
          )}
          {/* レベルタイマー直下: レジストレーションクローズまでのカウントダウン(MTT・RC前のみ)。 */}
          {regClosesAt && (
            <div className="mt-0.5 flex items-center gap-1 leading-none">
              <span className="text-[7px] font-black uppercase tracking-[0.18em] text-ink-600">Reg締切</span>
              <CountdownText endsAt={regClosesAt} className="text-[10px] font-black tabular-nums text-crimson-500" />
            </div>
          )}
          <div className="mt-1 flex items-end gap-2 leading-none">
            <div>
              <span className="block text-[7px] font-black uppercase tracking-[0.18em] text-ink-600">Blind</span>
              <span className="text-[11px] font-black tabular-nums text-ink-950">
                {level ? `${level.smallBlind.toLocaleString()}/${level.bigBlind.toLocaleString()}` : "—"}
              </span>
            </div>
            {level && level.bbAnte > 0 && (
              <div className="border-l border-ink-200 pl-2">
                <span className="block text-[7px] font-black uppercase tracking-[0.18em] text-ink-600">ANTE</span>
                <span className="text-[11px] font-black tabular-nums text-ink-950">{level.bbAnte.toLocaleString()}</span>
              </div>
            )}
            {tournamentInfo && bigBlind > 0 && tournamentInfo.averageStack > 0 && (
              <div className="border-l border-ink-200 pl-2">
                <span className="block text-[7px] font-black uppercase tracking-[0.18em] text-ink-600">Ave</span>
                <span className="text-[11px] font-black tabular-nums text-gold-600">
                  {Math.round(tournamentInfo.averageStack / bigBlind).toLocaleString()}
                  <span className="text-[8px] text-ink-600">BB</span>
                </span>
              </div>
            )}
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
            onShowChatLog={() => setChatLogOpen(true)}
            onLeave={() => {
              // その場で敗退とみなす: 着順=現在の残り人数(自分を含む)、賞金なし。
              setLeftResult({
                winnerPlayerId: null,
                yourFinishPosition: tournamentInfo?.remaining ?? null,
                yourPayout: 0,
              });
              leaveGame();
              setSettingsOpen(false);
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
            seatBubbles={seatBubbles}
            onHeroChatClick={() => setChatInputOpen(true)}
            heroShowIntent={heroShowIntent}
            onToggleHeroShow={toggleHeroShow}
          />
        )}
      </main>

      {/* チャット入力バー(自分のカードの吹き出しボタンから開く)。エンター送信で自席から吹き出し表示。 */}
      <AnimatePresence>
        {chatInputOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end bg-black/30"
            onClick={() => setChatInputOpen(false)}
          >
            <motion.form
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                const t = chatDraft.trim();
                if (t) sendChat(t);
                setChatDraft("");
                setChatInputOpen(false);
              }}
              className="safe-area-bottom flex w-full items-center gap-2 border-t border-ink-200 bg-white px-4 pb-6 pt-3"
            >
              <input
                autoFocus
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                maxLength={120}
                placeholder="メッセージを入力…"
                className="flex-1 rounded-full border border-ink-950 bg-white px-4 py-2.5 text-sm text-ink-950 outline-none placeholder:text-ink-300"
              />
              <button
                type="submit"
                aria-label="送信"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-950 text-white transition-transform active:scale-90"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="h-[18px] w-[18px]">
                  <path d="M4.5 12h13M12 5.5l6 6.5-6 6.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

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
                {matching?.starting ? "まもなく開始します…" : matching ? "マッチング中…" : "トーナメント開始準備中…"}
              </div>
            </div>
            {/* SNG(matching)のみ集合状況を表示。MTT(waiting)は人数やボット補充を一切匂わせない中立表示にする。 */}
            {matching && (
              <div className="text-[11px] text-ink-600 mt-1.5">{`${matching.registered} / ${matching.needed} 人集まりました`}</div>
            )}
            {matchingSecondsLeft !== null && !matching?.starting && (
              <div className="text-[11px] text-ink-500 mt-0.5">プレイヤーが集まり次第スタートします</div>
            )}
            {waiting && <div className="text-[11px] text-ink-500 mt-1.5">まもなく着席します…</div>}
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

      {/* 進行停止の診断オーバーレイ: ハンド終了後に一定時間進行が止まった場合、原因の説明と
          自動再同期の実行中であることを表示する(サーバー通知tableNoticeがあればその文言を優先)。 */}
      <AnimatePresence>
        {/* 結果画面(通常終了=tournamentOver / 自主離脱=leftResult)が出ている間は絶対に出さない。
            このバナーはz-40で結果画面(z-30)より前面にあるため、残すと「閉じる/シェア」ボタンを
            覆ってタップを奪ってしまう(ホームへ戻れなくなる)。 */}
        {(stalled || tableNotice) && !tournamentOver && !leftResult && !showGameGone && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-40 mx-auto w-[92%] max-w-md rounded-2xl border border-ink-950 bg-white p-4 shadow-[0_12px_32px_-12px_rgba(10,10,10,0.4)]"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-ink-950 border-t-transparent animate-spin" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-black text-ink-950">
                  {tableNotice
                    ? "サーバーからのお知らせ"
                    : STALL_INFO[diag?.stallReason ?? ""]?.title ?? "卓の進行が止まっています"}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-600">
                  {tableNotice
                    ? tableNotice.message
                    : STALL_INFO[diag?.stallReason ?? ""]?.body ??
                      "原因を調査中です。自動で再同期を試みています…"}
                </p>
                {/* 原因特定用の通信診断。tableNotice(サーバー起因の告知)のみの場合は出さない。 */}
                {stalled && diag && <StallDiagDetails diag={diag} connected={connected} />}
                {stalled && (
                  <button
                    type="button"
                    onClick={resync}
                    className="mt-2.5 w-full rounded-xl border border-ink-950 bg-white px-4 py-2 text-[12px] font-black text-ink-950 active:translate-y-px"
                  >
                    今すぐ再同期する
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 敗退直後のショーダウン猶予。相手の手札を見終えた人がすぐ進めるようにボタンを出す。 */}
      <AnimatePresence>
        {resultPending && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+24px)] z-40 mx-auto flex w-[92%] max-w-md justify-center"
          >
            <button
              type="button"
              onClick={() => setResultReady(true)}
              className="rounded-full bg-ink-950 px-6 py-3 text-[13px] font-black text-white shadow-[0_12px_32px_-12px_rgba(10,10,10,0.6)] transition-transform active:scale-[0.97]"
            >
              結果を見る
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 卓が本当に消えている場合の案内。強制退出はせず、本人の操作でホームへ戻れるようにする。 */}
      <AnimatePresence>
        {showGameGone && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-40 mx-auto w-[92%] max-w-md rounded-2xl border border-ink-950 bg-white p-4 shadow-[0_12px_32px_-12px_rgba(10,10,10,0.4)]"
          >
            <div className="flex items-start gap-3">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 h-4 w-4 shrink-0 text-ink-950"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4.5" />
                <path d="M12 16h.01" />
              </svg>
              <div className="min-w-0">
                <p className="text-[13px] font-black text-ink-950">進行中の卓が見つかりません</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-600">
                  このゲームはすでに終了しているか、サーバーの再起動でセッションが失われました。
                  自動での復帰は続けていますが、戻らない場合はホームから新しいゲームに参加してください。
                </p>
                <button
                  type="button"
                  onClick={onExit}
                  className="mt-3 w-full rounded-xl border border-ink-950 bg-ink-950 px-4 py-2 text-[13px] font-black text-white active:translate-y-px"
                >
                  ホームへ戻る
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {((tournamentOver && resultReady) || leftResult) && (
          <TournamentResultScreen
            info={(tournamentOver ?? leftResult)!}
            accessToken={accessToken}
            statsBefore={statsBefore}
            tournamentId={tournamentInfo?.tournamentId ?? null}
            gameKey={gameKey}
            totalEntrants={tournamentInfo?.total ?? null}
            displayName={displayName}
            onExit={onExit}
            canReEntry={gameKey === "mtt" && !leftResult && Boolean(tournamentOver?.canReEntry)}
            reEntryCost={tournamentOver?.reEntryCost ?? 2000}
            onReEntry={reEntry}
          />
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
          <GameHandHistorySheet
            records={gameHandHistory}
            bigBlind={bigBlind}
            displayName={displayName}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {chatLogOpen && (
          <ChatLogSheet
            messages={chatLog}
            yourSeatIndex={yourSeatIndex}
            players={players}
            myDisplayName={displayName}
            myAvatarKey={avatarKey}
            onSend={sendChat}
            onClose={() => setChatLogOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 相手タップで開くプレイヤー詳細モーダル(スタッツ+偏差値+5色マーキング+メモ)。 */}
      <AnimatePresence>
        {tappedPlayer && (
          <PlayerDetailModal
            target={{ userId: tappedPlayer.userId, displayName: tappedPlayer.displayName, avatarKey: tappedPlayer.avatarKey }}
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

/**
 * 読み込み中の表示。何秒待っているのかを必ず出す —— 「読み込み中…」だけでは
 * 進んでいるのか固まっているのかが利用者にもこちらにも分からず、原因調査ができない。
 * 長引いたときは診断ページへの導線も出す。
 */
function LoadingScreen({ what = "読み込み中" }: { what?: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const slow = seconds >= 5;
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-ink-50 px-6 text-center">
      <div className="flex items-center gap-2 text-ink-700">
        <span className="h-4 w-4 rounded-full border-2 border-ink-400 border-t-transparent animate-spin" />
        <span className="text-sm">
          {what}… <span className="tabular-nums text-ink-500">{seconds}秒</span>
        </span>
      </div>
      {slow && (
        <>
          <p className="max-w-xs text-[12px] leading-relaxed text-ink-500">
            通常より時間がかかっています。サーバーが混み合っているか、応答が遅れています。
          </p>
          <Link
            href="/diagnostics"
            className="rounded-xl border border-ink-950 bg-white px-4 py-2 text-[12px] font-black text-ink-950"
          >
            原因を診断する
          </Link>
        </>
      )}
    </div>
  );
}

/**
 * 進行中ゲームの復帰チェックが繰り返し失敗したときの脱出画面。「読み込み中…」で永久に固まらないよう、
 * 手動の再試行とホームへの脱出を必ず提供する(再試行はバックグラウンドでも継続している)。
 */
function ResumeErrorScreen({ onRetry, onHome }: { onRetry: () => void; onHome: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-ink-50 px-6 text-center">
      <div className="flex items-center gap-2 text-ink-700">
        <span className="h-4 w-4 rounded-full border-2 border-ink-400 border-t-transparent animate-spin" />
        <p className="text-sm font-medium">接続を再試行しています…</p>
      </div>
      <p className="max-w-xs text-[13px] leading-relaxed text-ink-500">
        サーバーに接続できません。進行中のゲームがある場合は、接続が回復すると自動的に復帰します。
      </p>
      <div className="flex items-center gap-2.5">
        <button
          onClick={onRetry}
          className="rounded-xl bg-ink-950 px-6 py-2.5 text-sm font-semibold text-white active:opacity-80"
        >
          今すぐ再試行
        </button>
        <button
          onClick={onHome}
          className="rounded-xl border border-ink-300 bg-white px-6 py-2.5 text-sm font-semibold text-ink-700 active:bg-ink-100"
        >
          ホーム画面へ
        </button>
      </div>
    </div>
  );
}

export default function Page() {
  const { t } = useI18n();
  const auth = useAuth();
  const accessToken = auth.session?.access_token;
  const { profile, loading: profileLoading, error: profileError, reload } = useProfile(accessToken);
  const [editingProfile, setEditingProfile] = useState(false);
  const [gameKey, setGameKey] = useState<GameKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // アプリ復帰/ログイン時に、進行中ゲームがあれば強制復帰、終了済みなら結果サジェストを表示する。
  const [resultSuggestion, setResultSuggestion] = useState<TournamentOverInfo | null>(null);
  const [resumeChecked, setResumeChecked] = useState(false);
  // 復帰チェックが数回失敗したら「読み込み中…」で固まらないよう脱出UI(再試行/ホームへ)を出す。
  const [resumeFailed, setResumeFailed] = useState(false);
  // 「再試行」で復帰チェックのeffectを即座に再起動するためのnonce。
  const [resumeNonce, setResumeNonce] = useState(0);
  // 招待リンク(/?ref=CODE)で来訪したときは、まずコードを退避してURLから消す(ログイン前でも実行する)。
  useEffect(() => {
    capturePendingReferralCode();
  }, []);

  // ログイン+オンボーディングが済んだ時点で、退避しておいた招待コードを一度だけ適用する。
  // 失敗(無効/自分のコード/適用済み)しても何も表示しない — ホームの招待カードから手入力で再挑戦できる。
  useEffect(() => {
    if (!accessToken || !profile?.onboarded) return;
    const pending = takePendingReferralCode();
    if (!pending) return;
    void redeemReferral(accessToken, pending).catch(() => {
      /* 通信断。招待は成立しないが、ホームの招待カードから手入力で適用できる。 */
    });
  }, [accessToken, profile?.onboarded]);

  // 初回ログイン時のみ一度だけ表示するチュートリアル。オンボーディング(名前+アバター設定)完了後、
  // 未読(localStorage未記録)なら出す。判定はマウント後(クライアントのみ)に行い、SSRとの不一致を避ける。
  const [tourChecked, setTourChecked] = useState(false);
  const [showTour, setShowTour] = useState(false);
  useEffect(() => {
    if (!profile?.onboarded || tourChecked) return;
    setShowTour(!hasTourBeenSeen());
    setTourChecked(true);
  }, [profile?.onboarded, tourChecked]);

  useEffect(() => {
    if (!accessToken || !profile?.onboarded || gameKey || resumeChecked) return;
    const serverUrl = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // 進行中ゲームの有無を「確定」するまで諦めない。ネットワーク断/サーバー起動待ち等で失敗した
    // 場合でも resumeChecked を立てず、指数バックオフで再試行し続ける。これにより、リフレッシュや
    // 一時的な回線断で進行中ゲームを取りこぼしてホームに取り残されることを厳密に防ぐ。
    const check = async (attempt: number): Promise<void> => {
      try {
        // 応答が返らず固まる(サーバーのコールドスタート/ハング)場合に備えて10秒でタイムアウトさせ、
        // catch経由でリトライ→脱出UIへ繋げる(タイムアウトが無いと永久に「読み込み中…」で固まる)。
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 10_000);
        const r = await fetch(`${serverUrl}/api/lobby/active-game`, {
          headers: { authorization: `Bearer ${accessToken}` },
          signal: ctrl.signal,
        }).finally(() => clearTimeout(to));
        if (!r.ok) throw new Error(`status ${r.status}`);
        const data = (await r.json()) as {
          gameKey?: string;
          result?: { winnerPlayerId: string | null; yourFinishPosition: number | null; yourPayout: number };
        };
        if (cancelled) return;
        if (data.gameKey === "sng" || data.gameKey === "mtt") {
          // 進行中ゲームがある → 強制的にそのゲーム画面へ戻す。
          setGameKey(data.gameKey);
        } else if (data.result) {
          setResultSuggestion({
            winnerPlayerId: data.result.winnerPlayerId,
            yourFinishPosition: data.result.yourFinishPosition,
            yourPayout: data.result.yourPayout,
          });
        }
        setResumeFailed(false);
        setResumeChecked(true); // 確定応答を得たときだけ確定にする。
      } catch {
        if (cancelled) return;
        // 数回失敗したら「読み込み中…」で固まらないよう脱出UIを出す(再試行はバックグラウンドで継続)。
        if (attempt >= 2) setResumeFailed(true);
        retryTimer = setTimeout(() => void check(attempt + 1), Math.min(8000, 1000 * 2 ** attempt));
      }
    };
    void check(0);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [accessToken, profile?.onboarded, gameKey, resumeChecked, resumeNonce]);

  // アプリがフォアグラウンドに戻ったら再チェックする(再取得は一度きり=結果サジェストは重複しない)。
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setResumeChecked(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // ゲストプレイは廃止。ログインなしでは常にログイン画面より先に進めない。
  if (!auth.authAvailable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50 text-ink-700 text-sm px-6 text-center">
        {t("app.authUnavailable")}
      </div>
    );
  }

  if (auth.loading) return <LoadingScreen />;
  if (!auth.session) return <LoginScreen auth={auth} />;
  if (profileLoading) return <LoadingScreen />;
  if (!profile) {
    // 失敗理由ごとに具体的な説明を出し、原因が分かるようにする。末尾に開発者向けの技術詳細
    // (reason/HTTPステータス/サーバー本文の先頭)も小さく表示する。
    const reason = profileError?.reason;
    const reasonMsg =
      reason === "timeout"
        ? t("app.profileErr.timeout")
        : reason === "network"
          ? t("app.profileErr.network")
          : reason === "unauthorized"
            ? t("app.profileErr.unauthorized")
            : reason === "notfound"
              ? t("app.profileErr.notfound")
              : reason === "server"
                ? t("app.profileErr.server")
                : reason === "parse"
                  ? t("app.profileErr.parse")
                  : reason === "no-token"
                    ? t("app.profileErr.noToken")
                    : reason === "http"
                      ? t("app.profileErr.http")
                      : t("app.profileFetchFailed");
    // 技術詳細(原因特定用): 例) "timeout" / "server (503)" / "http (429): Too Many..."
    const techParts: string[] = [];
    if (reason) techParts.push(reason);
    if (profileError?.status) techParts.push(`HTTP ${profileError.status}`);
    if (profileError?.detail) techParts.push(profileError.detail.slice(0, 120));
    const techDetail = techParts.join(" · ");
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-ink-50 px-6 text-center">
        <p className="text-base font-bold text-ink-900">{t("app.profileFetchFailed")}</p>
        <p className="max-w-xs text-sm text-ink-700">{reasonMsg}</p>
        <div className="flex flex-col items-center gap-2.5">
          <button onClick={() => void reload()} className="rounded-xl bg-mint-500 text-white text-sm font-semibold px-6 py-2.5 active:scale-[0.98] transition-transform">
            {t("app.retry")}
          </button>
          {reason === "unauthorized" && (
            <button
              onClick={() => void auth.signOut()}
              className="text-[13px] font-semibold text-ink-600 underline underline-offset-2"
            >
              {t("app.profileErr.relogin")}
            </button>
          )}
        </div>
        {techDetail && (
          <p className="mt-2 max-w-xs break-words font-mono text-[10px] leading-relaxed text-ink-400">{techDetail}</p>
        )}
        {/* サーバー側の詰まり(CPU飽和・DB遅延)まで踏み込んで原因を見るための導線。 */}
        <Link href="/diagnostics" className="text-[12px] font-bold text-ink-500 underline underline-offset-2">
          サーバーの状態を診断する
        </Link>
      </div>
    );
  }

  // 名前とアバターを決めるまでは、ホームには一切進めない(この分岐が常に先に評価される)。
  if (!profile.onboarded || editingProfile) {
    return (
      <Onboarding
        title={profile.onboarded ? t("onb.editTitle") : t("onb.setupTitle")}
        initialName={profile.onboarded ? profile.displayName : ""}
        initialAvatarKey={profile.avatarKey}
        submitLabel={profile.onboarded ? t("onb.save") : t("onb.start")}
        saving={saving}
        error={saveError}
        onSubmit={(params) => {
          setSaving(true);
          setSaveError(null);
          void saveProfile(accessToken!, params).then(async (saved) => {
            if (!saved) setSaveError(t("onb.saveFailed"));
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

  // 進行中ゲームの有無が確定するまではホームを出さない。リフレッシュ直後にホームが一瞬見えたり、
  // 進行中ゲームがあるのに新規ゲームを開始できてしまうことを防ぐ(確定するまで check() が再試行し続ける)。
  // ただし数回失敗して確定できないときは「読み込み中…」で永久に固まらないよう、脱出UI(再試行/ホームへ)を出す。
  if (!resumeChecked) {
    if (resumeFailed) {
      return (
        <ResumeErrorScreen
          onRetry={() => {
            setResumeFailed(false);
            setResumeNonce((n) => n + 1);
          }}
          onHome={() => {
            setResumeFailed(false);
            setResumeChecked(true);
          }}
        />
      );
    }
    return <LoadingScreen />;
  }

  // 初回ログイン時のみ一度だけ: ホームを出す直前にチュートリアルを挟む。
  if (showTour) return <WelcomeTour onDone={() => setShowTour(false)} />;

  // ログイン中アカウントに紐付いているプロバイダ一覧(例: ["google"], ["apple", "google"])。
  // 同一メールのApple/GoogleはSupabaseが同一アカウントに統合するため、複数表示されることがある。
  const providers =
    (auth.session.user.app_metadata?.["providers"] as string[] | undefined) ??
    (auth.session.user.app_metadata?.provider ? [auth.session.user.app_metadata.provider] : []);

  return (
    <>
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
      {/* 離席中に終わったゲームの結果サジェスト(復帰時に1回だけ表示)。 */}
      <AnimatePresence>
        {resultSuggestion && (
          <TournamentResultScreen
            info={resultSuggestion}
            accessToken={accessToken}
            statsBefore={null}
            displayName={profile.displayName}
            onExit={() => setResultSuggestion(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
