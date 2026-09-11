"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { ReportErrorButton } from "@/components/ReportErrorButton";
import { fetchPlayerNotes, PLAYER_NOTE_COLOR_HEX, type PlayerNoteColor } from "@/lib/playerNotes";
import type { AmountDisplayMode } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/components/Icon";
import { CheckMark } from "@/components/ui/CheckMark";

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
 * noActiveGame(進行中の卓なし応答)の理由コード→ユーザー向け説明。
 * どの分岐で「卓なし」と判定されたかをスクリーンショットから特定できるようにする。
 */
const GAME_GONE_INFO: Record<string, string> = {
  NO_SESSION: "サーバーにあなたの進行中セッションの記録がありません。サーバーの再起動でセッションが失われたか、ゲームが既に片付けられています。",
  SESSION_FINISHED: "このゲームはサーバー上で終了済みです。結果はホームでご確認ください。",
  USER_DONE: "このゲームでのあなたの成績は既に確定しています(バストまたは離脱済み)。",
  AUTH_FAILED: "ログイン情報の再検証に失敗し続けています(トークン期限切れの可能性)。自動で更新を待っていますが、戻らない場合は一度ログインし直してください。",
  RESUME_ERROR: "復帰処理でサーバー内部エラーが発生しています。自動で再試行しています。",
  UNKNOWN: "このゲームはすでに終了しているか、サーバーの再起動でセッションが失われました。",
};

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
    <div className="mt-2 rounded-lg bg-white/[0.05] px-2.5 py-2 font-mono text-[10px] leading-relaxed text-fg-2">
      {lines.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="w-16 shrink-0 text-fg-3">{k}</span>
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
  onClose,
}: {
  onShowStructure: () => void;
  onShowHistory: () => void;
  onShowChatLog: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+44px)] z-50 w-60 rounded-2xl glass-panel p-2 space-y-1">
        <button
          onClick={() => {
            onClose();
            onShowHistory();
          }}
          className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-fg hover:bg-n-2 transition-[background-color,transform] pressable"
        >
          {t("settings.handHistory")}
        </button>
        <button
          onClick={() => {
            onClose();
            onShowStructure();
          }}
          className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-fg hover:bg-n-2 transition-[background-color,transform] pressable"
        >
          {t("settings.blindStructure")}
        </button>
        <button
          onClick={() => {
            onClose();
            onShowChatLog();
          }}
          className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-fg hover:bg-n-2 transition-[background-color,transform] pressable"
        >
          {t("settings.chatLog")}
        </button>
      </div>
    </>
  );
}

/**
 * チップを破棄してゲームから離脱するボタン。設定メニューの中の1項目だと破壊的操作が
 * 他の閲覧系メニューと同列になり誤タップしやすいため、設定ボタンの隣に独立した丸アイコン
 * ボタンとして切り出した(設定ボタンと同じ寸法・意匠)。タップで即、画面中央にスクリム付きの
 * 確認モーダルを表示する(このアプリの他の確認モーダル=PasscodeModalと同じ構成: 全画面スクリム
 * +中央カード)。
 *
 * 以前はホバーで横に伸びてラベルが現れる演出(出典: uiverse.io by AKAspidey01)だったが、
 * タッチ操作では機能しない ―― タップ後もフォーカスが残って伸びたまま固定され、ラベルの
 * 「チップを破棄して離脱」が幅いっぱいで見切れる不具合になっていた。ホバー前提の演出を
 * タッチ主体の画面へ持ち込んだのが原因のため、展開演出そのものをやめて常時アイコンのみ+
 * 通常の確認モーダルへ変更した。
 */
function LeaveTableButton({ onLeave }: { onLeave: () => void }) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={t("settings.leave")}
        className="pressable shrink-0 h-8 w-8 rounded-full glass-panel flex items-center justify-center text-crimson-300"
      >
        <Icon name="chevron-left" className="h-4 w-4" />
      </button>
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirming(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-8"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[300px] rounded-2xl glass-panel p-5 shadow-e4"
            >
              <p className="text-center text-sm leading-relaxed text-fg">{t("settings.leaveConfirm")}</p>
              <div className="mt-4 flex gap-2.5">
                <button
                  onClick={() => setConfirming(false)}
                  className="pressable flex-1 rounded-xl bg-n-4 text-n-10 text-sm font-bold py-2.5"
                >
                  {t("settings.leaveCancel")}
                </button>
                <button
                  onClick={onLeave}
                  className="pressable flex-1 rounded-xl bg-crimson-600 text-white text-sm font-bold py-2.5"
                >
                  {t("settings.leaveDo")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * 自席の席ピルの左外に積む、小さな補助トグル(タイムバンク・離席)。
 *
 * 卓の中に置くので、卓と一緒に縮む(`useFitScale` の zoom 箱の中にある)。
 * 常時アニメーションする卓画面なので、ONの表現は色だけにして影やぼかしは足さない。
 * チェックボックス(uiverse.io by PriyanshuGupta28)の押しやすさ改善に合わせ、
 * 高さ28px→36pxへ(タップしやすい最小サイズに寄せる)。
 */
function SeatAsideToggle({
  active,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`pressable flex h-9 items-center gap-1.5 rounded-full px-2 transition-colors ${
        active ? "bg-accent/20 text-accent-hi ring-1 ring-inset ring-accent/60" : "glass-panel text-fg-3"
      }`}
    >
      {children}
    </button>
  );
}

function GameScreen({
  displayName,
  avatarKey,
  gameKey,
  accessToken,
  unlockCode,
  onExit,
}: {
  displayName: string;
  avatarKey: string | null;
  gameKey: GameKey;
  accessToken?: string;
  unlockCode?: string;
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
  } = usePokerSocket({ displayName, avatarKey, gameKey, accessToken, unlockCode });
  const { t } = useI18n();
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
  // 「離席」と「チェック/フォールド予約」。自席の横のトグルとアクションバーの隅のトグルの
  // 両方から触るので、状態はここで持って両方へ配る(以前は ActionBar のローカル state で、
  // 同じ離席トグルが場所ごとに別実装になっていた)。
  const [away, setAwayLocal] = useState(false);
  const [checkFoldArmed, setCheckFoldArmed] = useState(false);
  const toggleAway = useCallback(
    (next: boolean) => {
      setAwayLocal(next);
      setAway(next);
    },
    [setAway]
  );
  // 卓上の金額表示モード(bb換算/点数)。自席スタックのタップで切り替え、選択は端末に保存する。
  const [amountDisplayMode, setAmountDisplayMode] = useState<AmountDisplayMode>(() => {
    if (typeof window === "undefined") return "bb";
    try {
      return window.localStorage.getItem("tableAmountDisplayMode") === "chips" ? "chips" : "bb";
    } catch {
      return "bb";
    }
  });
  const toggleAmountDisplayMode = useCallback(() => {
    setAmountDisplayMode((cur) => {
      const next = cur === "bb" ? "chips" : "bb";
      try {
        window.localStorage.setItem("tableAmountDisplayMode", next);
      } catch {
        /* プライベートブラウズ等で保存できなくても切り替え自体は行う */
      }
      return next;
    });
  }, []);
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
    <div className="starfield relative isolate flex h-[100dvh] flex-col overflow-hidden">
      {/* 卓の外側に広がる星空。卓画像は黒地をアルファとして焼き込んだ透過版を使っているので、
          この星空が卓の内側まで途切れずに繋がり、卓の台紙が矩形として見えることがない。 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="starfield-layer starfield-1" />
        <div className="starfield-layer starfield-2" />
        <div className="starfield-layer starfield-3" />
      </div>
      {/* トーナメントクロック。以前は縦4段(Lv / 26pxのカウントダウン / 残り人数 / BLIND・ANTE・AVE)で
          122px を占めていた。実機の実測ではヘッダーとアクションバーだけで画面の63%を使っており、
          そのぶん卓が小さく描かれていた。同じ情報量を1行に畳んで 46px に収める。
          カウントダウンは引き続きこの行で一番大きく、色もアクセントのままなので、
          「次のレベルまで」が主役であることは変わらない。 */}
      <header className="relative flex items-center justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+4px)] pb-1.5 shrink-0">
        <button
          onClick={() => setStructureOpen(true)}
          className="glass-panel pressable flex h-9 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-2xl px-2.5 text-left text-fg"
        >
          <span className="shrink-0 text-[8px] font-black uppercase tracking-[0.18em] text-n-9 tabular-nums">
            LV{level?.level ?? "-"}
          </span>
          <CountdownText
            endsAt={levelEndsAt}
            className="shrink-0 text-[15px] font-black tabular-nums leading-none tracking-[-0.01em] text-accent"
          />
          {tournamentInfo && tournamentInfo.total > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 border-l border-line pl-2 leading-none">
              <Icon name="user" className="h-3 w-3 text-n-9" />
              <span className="text-[11px] font-black tabular-nums text-fg">
                {tournamentInfo.remaining}
                <span className="text-fg-2">/</span>
                {tournamentInfo.total}
              </span>
            </span>
          )}
          <span className="shrink-0 border-l border-line pl-2 text-[10px] font-black tabular-nums leading-none text-fg">
            {level ? `${level.smallBlind.toLocaleString()}/${level.bigBlind.toLocaleString()}` : "—"}
            {level && level.bbAnte > 0 && <span className="text-n-9">{` A${level.bbAnte.toLocaleString()}`}</span>}
          </span>
          {tournamentInfo && bigBlind > 0 && tournamentInfo.averageStack > 0 && (
            <span className="shrink-0 border-l border-line pl-2 text-[10px] font-black tabular-nums leading-none text-accent">
              {Math.round(tournamentInfo.averageStack / bigBlind).toLocaleString()}
              <span className="text-[8px] text-n-9">BB</span>
            </span>
          )}
          {regClosesAt && (
            <span className="flex shrink-0 items-center gap-1 border-l border-line pl-2 leading-none">
              <span className="text-[8px] font-black uppercase tracking-[0.14em] text-n-9">Reg</span>
              <CountdownText endsAt={regClosesAt} className="text-[10px] font-black tabular-nums text-crimson-300" />
            </span>
          )}
          {gameKey === "mtt" && (
            <span className="shrink-0 rounded bg-n-4 px-1 py-[1px] text-[7px] font-black tracking-widest text-white">MTT</span>
          )}
          {tournamentInfo?.isFinalTable && (
            <span className="shrink-0 rounded bg-accent px-1 py-[1px] text-[7px] font-black tracking-widest text-on-accent">
              FINAL
            </span>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <LeaveTableButton
            onLeave={() => {
              // その場で敗退とみなす: 着順=現在の残り人数(自分を含む)、賞金なし。
              setLeftResult({
                winnerPlayerId: null,
                yourFinishPosition: tournamentInfo?.remaining ?? null,
                yourPayout: 0,
              });
              leaveGame();
            }}
          />
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="shrink-0 h-8 w-8 rounded-full glass-panel flex items-center justify-center text-n-10 pressable transition-transform"
            aria-label={t("settings.title")}
          >
            <Icon name="settings" className="h-4 w-4" />
          </button>
        </div>
        {settingsOpen && (
          <SettingsPopover
            onShowStructure={() => setStructureOpen(true)}
            onShowHistory={() => setHistoryOpen(true)}
            onShowChatLog={() => setChatLogOpen(true)}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </header>

      <main className="flex-1 min-h-0 overflow-hidden px-2">
        {spectating ? (
          <div className="text-center text-fg-2 text-sm py-20">
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
            displayMode={amountDisplayMode}
            onToggleDisplayMode={toggleAmountDisplayMode}
            heroAside={
              <>
                {timeBank && (
                  <SeatAsideToggle
                    active={timeBank.armed}
                    onClick={() => armTimeBank(!timeBank.armed)}
                    ariaLabel={t("action.timeBank")}
                  >
                    <CheckMark on={timeBank.armed} className="h-5 w-5" />
                    {/* 残り枚数はピップで。0枚のときは点を出さず、押しても意味が無いことを示す。 */}
                    <span className="flex items-center gap-[3px]">
                      {Array.from({ length: timeBank.cards }).map((_, i) => (
                        <span key={i} className="h-1 w-1 rounded-full bg-accent" />
                      ))}
                    </span>
                  </SeatAsideToggle>
                )}
                <SeatAsideToggle active={away} onClick={() => toggleAway(!away)} ariaLabel={t("action.away")}>
                  <Icon name="pause" className="h-3.5 w-3.5" />
                </SeatAsideToggle>
              </>
            }
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
            className="fixed inset-0 z-50 flex items-end bg-black/50"
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
              className="glass-footer safe-area-bottom flex w-full items-center gap-2 px-4 pb-6 pt-3"
            >
              <input
                autoFocus
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                maxLength={120}
                placeholder="メッセージを入力…"
                className="input-inset flex-1 rounded-full px-4 py-2.5 text-sm text-fg outline-none placeholder:text-fg-faint"
              />
              <button
                type="submit"
                aria-label="送信"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-n-4 text-white transition-transform pressable"
              >
                <Icon name="arrow-right" className="h-[18px] w-[18px]" />
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
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] right-4 z-30 w-56 rounded-2xl glass-panel p-3.5"
          >
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full border-2 border-line-strong border-t-transparent animate-spin" />
              <div className="text-xs font-semibold text-fg">
                {matching?.starting ? "まもなく開始します…" : matching ? "マッチング中…" : "トーナメント開始準備中…"}
              </div>
            </div>
            {/* SNG(matching)のみ集合状況を表示。MTT(waiting)は人数やボット補充を一切匂わせない中立表示にする。 */}
            {matching && (
              <div className="text-[11px] text-n-9 mt-1.5">{`${matching.registered} / ${matching.needed} 人集まりました`}</div>
            )}
            {matchingSecondsLeft !== null && !matching?.starting && (
              <div className="text-[11px] text-fg-2 mt-0.5">プレイヤーが集まり次第スタートします</div>
            )}
            {waiting && <div className="text-[11px] text-fg-2 mt-1.5">まもなく着席します…</div>}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(actionError || joinError) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-auto mb-2 max-w-md rounded-2xl bg-crimson-500/10 ring-1 ring-crimson-500/40 px-4 py-2 text-center"
          >
            <p className="text-xs text-crimson-300">{actionError ?? joinError}</p>
            <ReportErrorButton
              scope={actionError ? "table:action" : "table:join"}
              message={actionError ?? joinError ?? ""}
              accessToken={accessToken}
              className="mt-1.5 justify-center"
              context={{ gameKey, yourSeatIndex, connected, stallReason: diag?.stallReason ?? null }}
            />
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
            className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-40 mx-auto w-[92%] max-w-md rounded-2xl glass-panel p-4 shadow-e3"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-line-strong border-t-transparent animate-spin" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-black text-fg">
                  {tableNotice
                    ? "サーバーからのお知らせ"
                    : STALL_INFO[diag?.stallReason ?? ""]?.title ?? "卓の進行が止まっています"}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-n-9">
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
                    className="pressable mt-2.5 w-full rounded-xl bg-white/[0.10] px-4 py-2 text-[12px] font-black text-fg ring-1 ring-inset ring-white/12"
                  >
                    今すぐ再同期する
                  </button>
                )}
                <ReportErrorButton
                  scope={tableNotice ? "table:notice" : "table:stalled"}
                  message={
                    tableNotice
                      ? tableNotice.message
                      : STALL_INFO[diag?.stallReason ?? ""]?.title ?? "卓の進行が止まっています"
                  }
                  detail={diag?.stallReason ?? null}
                  accessToken={accessToken}
                  className="mt-2"
                  context={{ gameKey, connected, tableNotice, diag }}
                />
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
              className="rounded-full bg-n-4 px-6 py-3 text-[13px] font-black text-white shadow-e3 pressable"
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
            className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-40 mx-auto w-[92%] max-w-md rounded-2xl glass-panel p-4 shadow-e3"
          >
            <div className="flex items-start gap-3">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-fg" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-black text-fg">進行中の卓が見つかりません</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-n-9">
                  {GAME_GONE_INFO[diag?.lastNoActiveGame?.reason ?? "UNKNOWN"] ?? GAME_GONE_INFO["UNKNOWN"]}{" "}
                  自動での復帰は続けていますが、戻らない場合はホームから新しいゲームに参加してください。
                </p>
                {/* 原因特定用の診断行: 理由コード・連続回数・最終盤面受信からの経過。 */}
                {diag && (
                  <div className="mt-2 rounded-lg bg-white/[0.05] px-2.5 py-2 font-mono text-[10px] leading-relaxed text-fg-2">
                    <div>
                      コード {diag.lastNoActiveGame?.reason ?? "-"}
                      {diag.lastNoActiveGame ? `(${diag.lastNoActiveGame.count}回)` : ""} / 接続{" "}
                      {connected ? "中" : `断(${diag.disconnectReason ?? "?"})`}
                    </div>
                    <div>
                      盤面 {diagAgo(diag.lastStateAt, Date.now())} / 受信 {diagAgo(diag.lastEventAt, Date.now())} / 再同期{" "}
                      {diag.resyncCount}回
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={onExit}
                  className="pressable mt-3 w-full rounded-xl bg-accent px-4 py-2 text-[13px] font-black text-on-accent shadow-glow"
                >
                  ホームへ戻る
                </button>
                {/* 再発時に原因を切り分けられるよう、通信診断(切断理由・再接続回数・最終受信からの経過等)を
                    表示する。スクリーンショット1枚で「サーバー再起動」か「通信断」か等が分かる。 */}
                {diag && <StallDiagDetails diag={diag} connected={connected} />}
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
            tournamentId={tournamentInfo?.tournamentId ?? null}
            accessToken={accessToken}
            displayMode={amountDisplayMode}
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
          away={away}
          onToggleAway={toggleAway}
          checkFoldArmed={checkFoldArmed}
          onToggleCheckFold={setCheckFoldArmed}
          displayMode={amountDisplayMode}
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
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <div className="flex items-center gap-2 text-n-9">
        <span className="h-4 w-4 rounded-full border-2 border-line border-t-transparent animate-spin" />
        <span className="text-sm">
          {what}… <span className="tabular-nums text-fg-2">{seconds}秒</span>
        </span>
      </div>
      {slow && (
        <>
          <p className="max-w-xs text-[12px] leading-relaxed text-fg-2">
            通常より時間がかかっています。サーバーが混み合っているか、応答が遅れています。
          </p>
          <Link
            href="/diagnostics"
            className="pressable rounded-xl bg-white/[0.10] px-4 py-2 text-[12px] font-black text-fg ring-1 ring-inset ring-white/12"
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
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <div className="flex items-center gap-2 text-n-9">
        <span className="h-4 w-4 rounded-full border-2 border-line border-t-transparent animate-spin" />
        <p className="text-sm font-medium">接続を再試行しています…</p>
      </div>
      <p className="max-w-xs text-[13px] leading-relaxed text-fg-2">
        サーバーに接続できません。進行中のゲームがある場合は、接続が回復すると自動的に復帰します。
      </p>
      <div className="flex items-center gap-2.5">
        <button
          onClick={onRetry}
          className="rounded-xl bg-n-4 px-6 py-2.5 text-sm font-semibold text-white pressable"
        >
          今すぐ再試行
        </button>
        <button
          onClick={onHome}
          className="pressable rounded-xl bg-white/[0.10] px-6 py-2.5 text-sm font-semibold text-fg-2 ring-1 ring-inset ring-white/12"
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
  const accessToken = auth.accessToken ?? undefined;
  const { profile, loading: profileLoading, error: profileError, reload } = useProfile(accessToken);
  const [editingProfile, setEditingProfile] = useState(false);
  const [gameKey, setGameKey] = useState<GameKey | null>(null);
  // MTTは通常「準備中」でサーバー側もゲートしている。解錠パスコードを入れて入室した場合のみ、
  // その値をソケットのjoinGameに載せてサーバーのゲートを通す(SNGでは undefined)。
  const [unlockCode, setUnlockCode] = useState<string | undefined>(undefined);
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
      <div className="min-h-screen flex items-center justify-center bg-canvas text-n-9 text-sm px-6 text-center">
        {t("app.authUnavailable")}
      </div>
    );
  }

  if (auth.loading) return <LoadingScreen />;
  // 埋め込みモード(RRPokerの中)では自前のログイン画面を出さない。親アプリが既にログイン済みで、
  // トークンは親から受け取る。まだ届いていない間は読み込み中として待つ。
  if (auth.embedded) {
    if (!accessToken) return <LoadingScreen />;
  } else if (!auth.session) {
    return <LoginScreen auth={auth} />;
  }
  if (profileLoading) return <LoadingScreen />;
  if (!profile) {
    // 失敗理由ごとに具体的な説明を出し、原因が分かるようにする。末尾に開発者向けの技術詳細
    // (reason/HTTPステータス/サーバー本文の先頭)も小さく表示する。
    const reason = profileError?.reason;
    // 埋め込みで開いているときは、認証が通らない理由が「期限切れ」ではない。トークンは
    // 親アプリから渡されるので、この画面にログインし直す手段は無く、「ログインし直す」は
    // 押しても何も起きない案内になってしまう。埋め込み時だけ文言と導線を差し替える。
    const embeddedAuthProblem = auth.embedded && (reason === "unauthorized" || reason === "no-token");
    const reasonMsg = embeddedAuthProblem
      ? t("app.profileErr.embedUnauthorized")
      : reason === "timeout"
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <p className="text-base font-bold text-fg">{t("app.profileFetchFailed")}</p>
        <p className="max-w-xs text-sm text-n-9">{reasonMsg}</p>
        <div className="flex flex-col items-center gap-2.5">
          <button onClick={() => void reload()} className="rounded-xl bg-mint-700 text-white text-sm font-semibold px-6 py-2.5 pressable">
            {t("app.retry")}
          </button>
          {reason === "unauthorized" && !embeddedAuthProblem && (
            <button
              onClick={() => void auth.signOut()}
              className="pressable text-[13px] font-semibold text-n-9 underline underline-offset-2"
            >
              {t("app.profileErr.relogin")}
            </button>
          )}
        </div>
        {techDetail && (
          <p className="mt-2 max-w-xs break-words font-mono text-[10px] leading-relaxed text-fg-3">{techDetail}</p>
        )}
        {/* サーバー側の詰まり(CPU飽和・DB遅延)まで踏み込んで原因を見るための導線。 */}
        <Link href="/diagnostics" className="text-[12px] font-bold text-fg-2 underline underline-offset-2">
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
          void saveProfile(accessToken!, params)
            .then(async (saved) => {
              if (!saved) setSaveError(t("onb.saveFailed"));
              else await reload();
              setSaving(false);
              setEditingProfile(false);
            })
            .catch(() => {
              // 通信失敗でも保存ボタンが「保存中…」のまま固まらないようにする(操作不能を防ぐ)。
              setSaveError(t("onb.saveFailed"));
              setSaving(false);
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
        unlockCode={unlockCode}
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
  // 埋め込みモードでは親アプリのアカウントで入っているため、Supabaseのプロバイダ情報は無い。
  const appMetadata = auth.session?.user.app_metadata;
  const providers =
    (appMetadata?.["providers"] as string[] | undefined) ??
    (appMetadata?.provider ? [appMetadata.provider] : []);

  return (
    <>
      <Lobby
        displayName={profile.displayName}
        avatarKey={profile.avatarKey}
        email={profile.email}
        providers={providers}
        userId={profile.id}
        accessToken={accessToken}
        onJoin={(key, code) => {
          setUnlockCode(code);
          setGameKey(key);
        }}
        onEditProfile={() => setEditingProfile(true)}
        onSignOut={() => {
          setGameKey(null);
          void auth.signOut();
        }}
        onAccountDeleted={() => {
          // 退会後はもうログインできないので、卓から抜けてサインアウトしログイン画面へ戻す。
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
