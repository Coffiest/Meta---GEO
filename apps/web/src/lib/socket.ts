"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { PlayerAction, PublicHandState } from "@meta-geo/engine";

export interface HandEndedPayload {
  result: {
    board: string[];
    pots: { amount: number; eligiblePlayerIds: string[] }[];
    payouts: Record<string, number>;
    wonByFold: boolean;
  };
  holeCards: Record<number, string[]>;
  /** MTTのとき: トーナメント全体の残り人数 */
  remainingPlayers?: number;
}

export interface LevelInfo {
  level: number;
  smallBlind: number;
  bigBlind: number;
  bbAnte: number;
  durationMinutes: number;
}

/** ヘッダーの直近ハンド履歴ストリップ用の1件分(ヒーローのホールカード + 収支) */
export interface HandHistoryEntry {
  cards: string[];
  deltaChips: number;
}

/** このゲーム(トーナメント)中に自分がプレイした1ハンドの記録。設定→ハンド履歴で全件閲覧する。 */
export interface GameHandRecord {
  /** 自分のホールカード(自分は常に自分の手札を知っているため表向きで表示できる) */
  heroCards: string[];
  /** 最終ボード(公開領域) */
  board: string[];
  /** 自分の収支(チップ) */
  delta: number;
  /** 全員フォールドで決着したか */
  wonByFold: boolean;
}

export type SeatActionKind = "bet" | "raise" | "call" | "check" | "fold" | "allIn";

export interface SeatAction {
  kind: SeatActionKind;
  toAmount: number;
}

export interface SeatPlayerInfo {
  /** 対象プレイヤーのUser.id。相手タップ時の詳細モーダル/メモ取得に使う。 */
  userId: string;
  displayName: string;
  avatarKey: string | null;
  /** 離席中(自動チェック/フォールド)。全員の座席に「離席中」を表示するため。 */
  away: boolean;
}

export interface TurnTimerInfo {
  seatIndex: number;
  endsAt: number;
  durationMs: number;
}

export interface PrizePlace {
  place: number;
  amount: number;
}

/** ライブ順位の1行(BB持ち降順)。 */
export interface StandingRow {
  userId: string;
  displayName: string;
  stack: number;
  bbStack: number;
  rank: number;
}

/** トーナメントクロック画面用の集計情報(サーバーのbroadcastTournamentInfoから)。 */
export interface TournamentInfo {
  /** 生き残っている人数。 */
  remaining: number;
  /** 総エントリー数。 */
  total: number;
  /** アベレージスタック(生存者の平均持ち点)。 */
  averageStack: number;
  /** ペイアウト構造(RC後のみ。RC前は空)。 */
  prizePool: PrizePlace[];
  /** プライズプール総額(RC前の表示用)。 */
  prizePoolTotal?: number;
  /** レジストレーションがクローズ済みか。 */
  registrationClosed?: boolean;
  /** レジクローズ時刻(epoch ms)。RC前のカウントダウン用。null=RC済み/未スタート。 */
  registrationClosesAt?: number | null;
  /** ファイナルテーブル(残り1卓)か。 */
  isFinalTable?: boolean;
  /** 全生存者のBB持ち降順ランキング。 */
  standings?: StandingRow[];
  /** このトーナメントのDB ID(棋譜解析への遷移に使う)。未確定時はnull。 */
  tournamentId?: string | null;
}

/** 同卓チャットの1メッセージ。 */
export interface ChatMessage {
  seatIndex: number;
  userId: string;
  displayName: string;
  text: string;
  ts: number;
}

export interface TournamentOverInfo {
  winnerPlayerId: string | null;
  yourFinishPosition: number | null;
  yourPayout: number;
  /** リエントリ可能か(MTT・レジクローズ前・満員でない)。 */
  canReEntry?: boolean;
  /** リエントリの参加費(チップ)。 */
  reEntryCost?: number;
}

export interface TimeBankInfo {
  cards: number;
  armed: boolean;
  consumed?: boolean;
}

export interface MatchingInfo {
  registered: number;
  needed: number;
  secondsLeft: number | null;
  starting?: boolean;
}

export interface WaitingInfo {
  registered: number;
  needed: number;
}

/** 直近に送信したアクションの診断記録(送信→サーバーACKまでの追跡)。 */
export interface ActionDiag {
  /** 送ったアクション種別(fold/call/bet等) */
  kind: string;
  /** 送信時刻(ms epoch) */
  sentAt: number;
  /** pending=応答待ち / acked=サーバーが受領 / timeout=一定時間応答なし / unsent=未接続で送信不可 */
  status: "pending" | "acked" | "timeout" | "unsent";
  /** サーバーが返した処理結果コード(OK/NOT_YOUR_TURN/NO_TABLE等) */
  ackCode?: string;
  /** 送信からACKまでの所要時間(ms) */
  ackElapsedMs?: number;
}

/**
 * フリーズ原因特定用の通信診断スナップショット。停止検知時にオーバーレイへ表示し、
 * スクリーンショットから原因(切断/ゾンビ接続/サーバー停止/アクション不達)を判別できるようにする。
 */
export interface SocketDiag {
  /** 停止原因の分類コード(F-OFFLINE/F-DISCONNECTED/F-ZOMBIE/F-NO-PROGRESS/F-NEXT-HAND/F-TURN-EXPIRED) */
  stallReason: string | null;
  /** 最後にサーバーから何かを受信した時刻(イベント名も保持) */
  lastEventAt: number | null;
  lastEventName: string | null;
  /** 最後に盤面(state)を受信した時刻 */
  lastStateAt: number | null;
  /** 最後に手番タイマーを受信した時刻 */
  lastTurnTimerAt: number | null;
  /** 最後にhandEnded(ハンド終了)を受信した時刻 */
  lastHandEndedAt: number | null;
  /** 最後に接続が確立した時刻 */
  connectedAt: number | null;
  /** 最後に切断された時刻と理由(socket.ioのdisconnect reason) */
  disconnectedAt: number | null;
  disconnectReason: string | null;
  /** 最後の接続エラーメッセージ(connect_error) */
  connectErrorMessage: string | null;
  /** 再接続の試行回数 */
  reconnectAttempts: number;
  /** 自動再同期(resumeGame再送)を実行した回数 */
  resyncCount: number;
  /** 直近に送信したアクションの追跡記録 */
  lastAction: ActionDiag | null;
}

export interface PokerSocketState {
  connected: boolean;
  spectating: boolean;
  state: PublicHandState | null;
  yourSeatIndex: number | null;
  yourCards: string[];
  lastHandEnded: HandEndedPayload | null;
  level: LevelInfo | null;
  /** 現在のブラインドレベルが終わる時刻(ms epoch)。次レベルまでのカウントダウン表示用。 */
  levelEndsAt: number | null;
  /** トーナメントクロック画面用の集計情報(残り人数/アベレージ/プライズ)。 */
  tournamentInfo: TournamentInfo | null;
  /** 同卓チャットのログ(古い順)。設定→チャットログ表示に使う。 */
  chatLog: ChatMessage[];
  /** 座席ごとの直近チャット吹き出し(数秒で自動消去)。 */
  seatBubbles: Record<number, { text: string; ts: number }>;
  tournamentOver: TournamentOverInfo | null;
  actionError: string | null;
  players: Record<number, SeatPlayerInfo>;
  handHistory: HandHistoryEntry[];
  /** このゲーム中に自分がプレイした全ハンドの記録(設定→ハンド履歴で閲覧)。 */
  gameHandHistory: GameHandRecord[];
  /** ハンド中の各座席の最後のアクション(そのストリート中だけ表示し、ストリートが変わると消える) */
  lastActionBySeat: Record<number, SeatAction>;
  /** 直近に終わったハンドの、座席ごとの収支(次のハンドの最初のstateが来るまで表示用に保持) */
  lastHandDeltaBySeat: Record<number, number> | null;
  /** アクティブ席の持ち時間(アバター周囲のリング表示用) */
  turnTimer: TurnTimerInfo | null;
  /** 自分のタイムバンクカード残数とON/OFF状態 */
  timeBank: TimeBankInfo | null;
  /** SNGマッチング待合室の状態(6人揃うまで/60秒まで) */
  matching: MatchingInfo | null;
  /** MTT開始待ち(4人揃うまで)の状態 */
  waiting: WaitingInfo | null;
  /** ゲーム参加(joinGame)が失敗した場合のエラーメッセージ */
  joinError: string | null;
  /** 再接続時に進行中の卓が見つからなかった(=ロビーへ戻すべき)。新規ゲームは作らない。 */
  gameGone: boolean;
  /**
   * オールインでベッティングが閉じた時点で(残りのボードが開く前に)テーブルアップされた
   * 手札。TDAルールの「ショウダウン→ランアウト」の公開順を再現するためにhandEndedより先に届く。
   */
  runoutHoleCards: Record<number, string[]> | null;
  /** サーバーからの卓ノイズ通知(次ハンド開始の再試行中/停止など)。新ハンド開始で消える。 */
  tableNotice: { kind: string; message: string } | null;
  /**
   * ハンド終了後、一定時間たっても次のハンドが始まらない(サーバーからの通知が途絶している)。
   * trueの間、画面に停止診断オーバーレイを表示し、裏で自動的に再同期(resumeGame)を試みる。
   */
  stalled: boolean;
  /** フリーズ原因特定用の通信診断スナップショット(停止検知時・再同期のたびに更新)。 */
  diag: SocketDiag | null;
}

const SOCKET_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

/**
 * "action" のACKでサーバーが返す処理結果コード→ユーザー向け説明。
 * 「押したのに何も起きない」原因をその場で特定・表示するためのもの。
 */
const ACTION_ACK_MESSAGES: Record<string, string> = {
  NOT_IN_TOURNAMENT: "サーバーにあなたの参加記録が見つかりません",
  NO_TABLE: "サーバー上であなたの卓が見つかりません(卓移動の処理中の可能性)",
  NO_SEAT: "サーバー上の座席情報が見つかりません",
  NO_HAND: "サーバー側ではハンドが始まっていません",
  HAND_COMPLETE: "サーバー側ではこのハンドは既に終了しています",
  NOT_YOUR_TURN: "サーバー側ではあなたの手番ではありません(表示が古い可能性)",
  HANDLER_ERROR: "サーバー内部エラーでアクションを処理できませんでした",
};

/** 各席のアクションバッジ(Call/Check等)の表示時間(ms)。ストリートが進んでも一瞬は残す。 */
const SEAT_ACTION_BADGE_MS = 1700;

export type GameKey = "sng" | "mtt";

export interface PokerSocketParams {
  displayName: string;
  avatarKey: string | null;
  gameKey: GameKey;
  /** Supabase Authのアクセストークン。未ログイン(ゲストモード)ならundefined。 */
  accessToken?: string;
}

export function usePokerSocket({ displayName, avatarKey, gameKey, accessToken }: PokerSocketParams) {
  const socketRef = useRef<Socket | null>(null);
  // 席ごとのアクションバッジ消去タイマー。座席index→timeout id。
  const badgeTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // 一度でも joinGame(新規参加)を送ったか。再接続時は resumeGame にして新規ゲームを作らせない。
  const hasJoinedRef = useRef(false);
  // 対局が開始したか(state を1度でも受信)。開始後の再接続は resumeGame(卓へ復帰)、
  // マッチング中の再接続は joinGame(キューへ再参加)にする。
  const hasStartedRef = useRef(false);
  const [data, setData] = useState<PokerSocketState>({
    connected: false,
    spectating: false,
    state: null,
    yourSeatIndex: null,
    yourCards: [],
    lastHandEnded: null,
    level: null,
    levelEndsAt: null,
    tournamentInfo: null,
    chatLog: [],
    seatBubbles: {},
    tournamentOver: null,
    actionError: null,
    players: {},
    handHistory: [],
    gameHandHistory: [],
    lastActionBySeat: {},
    lastHandDeltaBySeat: null,
    turnTimer: null,
    timeBank: null,
    matching: null,
    waiting: null,
    joinError: null,
    gameGone: false,
    runoutHoleCards: null,
    tableNotice: null,
    stalled: false,
    diag: null,
  });

  // ショウダウン後フリーズの監視タイマー。handEndedから一定時間ハンドが進まなければ
  // stalled=true にして診断オーバーレイを出し、以降5秒おきに resumeGame で再同期を試みる。
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ハンド"中"フリーズの監視。サーバーからの進行イベント(state/turnTimer/seatAction)が一定時間
  // 途絶えたら停止とみなし、自動再同期する。自分の手番の長考は誤検知しないよう除外する。
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ウォッチドッグ判定用に最新の手番/自席/完了状態/手番タイマーを保持する(タイマー発火時に参照)。
  const liveStateRef = useRef<{
    actingSeatIndex: number | null;
    yourSeatIndex: number | null;
    isComplete: boolean;
    over: boolean;
    lastTurn: TurnTimerInfo | null;
  }>({ actingSeatIndex: null, yourSeatIndex: null, isComplete: false, over: false, lastTurn: null });
  // 復帰(resync)フォールバック。forceResyncで resumeGame を再送した後、一定時間サーバーからの
  // 受信が無ければ「ゾンビ接続(connected===trueだが実際は死んでいる)」とみなして強制再ハンドシェイク
  // する。任意のサーバー受信(onAny)で解除する。lastForceResyncRefは多重発火のデバウンス用。
  const resyncFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastForceResyncRef = useRef(0);
  // フリーズ原因特定用の診断記録。再レンダーを避けるためrefに随時記録し、停止検知・再同期・
  // アクションACKなどの節目でだけ state(diag)へスナップショットを反映する。
  const diagRef = useRef<SocketDiag>({
    stallReason: null,
    lastEventAt: null,
    lastEventName: null,
    lastStateAt: null,
    lastTurnTimerAt: null,
    lastHandEndedAt: null,
    connectedAt: null,
    disconnectedAt: null,
    disconnectReason: null,
    connectErrorMessage: null,
    reconnectAttempts: 0,
    resyncCount: 0,
    lastAction: null,
  });
  // sendAction(useEffect外)からforceResync(useEffect内)を呼ぶための橋渡し。
  const forceResyncRef = useRef<((opts?: { immediate?: boolean }) => void) | null>(null);
  // 停止を検知した文脈(inHand=ハンド中の進行途絶 / afterHand=ハンド終了後 / turnExpired=手番の期限切れ放置)。
  const stallCtxRef = useRef<"inHand" | "afterHand" | "turnExpired">("inHand");

  useEffect(() => {
    const clearBadgeTimers = () => {
      for (const id of Object.values(badgeTimersRef.current)) clearTimeout(id);
      badgeTimersRef.current = {};
    };
    const clearStallWatch = () => {
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
      if (resyncTimerRef.current) clearInterval(resyncTimerRef.current);
      resyncTimerRef.current = null;
    };
    hasJoinedRef.current = false;
    hasStartedRef.current = false;
    const socket = io(SOCKET_URL, {
      auth: { displayName, avatarKey, accessToken },
      transports: ["websocket", "polling"],
      // 切断を検知したら無限に自動再接続する(バックグラウンド/回線断からの復帰を確実にする)。
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 8000,
    });
    socketRef.current = socket;

    // 任意のサーバー受信で「通信経路は生きている」と判断し、強制再接続フォールバックを解除する。
    const clearResyncFallback = () => {
      if (resyncFallbackRef.current) clearTimeout(resyncFallbackRef.current);
      resyncFallbackRef.current = null;
    };
    socket.onAny((eventName: string) => {
      clearResyncFallback();
      // 診断用: 最後にサーバーから受信したイベントと時刻を常に記録する。
      diagRef.current.lastEventAt = Date.now();
      diagRef.current.lastEventName = eventName;
    });
    // 診断用: 接続エラー/再接続試行/切断理由を記録する(停止オーバーレイに表示)。
    socket.on("connect_error", (err: Error) => {
      diagRef.current.connectErrorMessage = err?.message ?? String(err);
    });
    socket.io.on("reconnect_attempt", (attempt: number) => {
      diagRef.current.reconnectAttempts = attempt;
    });

    // バックグラウンド復帰/タブ復帰/回線復帰時に「必ず」進行中の卓へ再アタッチする中核。
    // socket.connected を盲信せず、接続中に見えても3秒応答が無ければゾンビ接続とみなして
    // disconnect→connect で強制再ハンドシェイクする(connectハンドラが resumeGame を再送する)。
    const forceResync = (opts?: { immediate?: boolean }) => {
      const s = socketRef.current;
      if (!s) return;
      const now = Date.now();
      if (!opts?.immediate && now - lastForceResyncRef.current < 1500) return;
      lastForceResyncRef.current = now;
      diagRef.current.resyncCount += 1;
      if (!s.connected) {
        s.connect();
        return;
      }
      if (hasStartedRef.current) s.emit("resumeGame");
      else s.emit("joinGame", { gameKey });
      clearResyncFallback();
      resyncFallbackRef.current = setTimeout(() => {
        const s2 = socketRef.current;
        if (!s2) return;
        try {
          s2.disconnect();
        } catch {
          /* noop */
        }
        s2.connect();
      }, 3000);
    };
    forceResyncRef.current = forceResync;

    // 停止原因の分類。停止を検知した瞬間と、その後の再同期のたびに再評価して診断表示を更新する。
    const classifyStall = (ctx: "inHand" | "afterHand" | "turnExpired"): string => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return "F-OFFLINE";
      const s = socketRef.current;
      if (!s?.connected) return "F-DISCONNECTED";
      const now = Date.now();
      const dg = diagRef.current;
      // 接続中に見えるのにサーバーから何も届いていない=ゾンビ接続の疑い。
      if (dg.lastEventAt !== null && now - dg.lastEventAt > 20_000) return "F-ZOMBIE";
      if (ctx === "turnExpired") return "F-TURN-EXPIRED";
      // 何かは届いている(chatやtournamentInfo等)のに、盤面進行(state/turnTimer)だけが止まっている
      // =サーバー側の卓進行が停止している疑い。
      const lastProgress = Math.max(dg.lastStateAt ?? 0, dg.lastTurnTimerAt ?? 0);
      if (lastProgress > 0 && now - lastProgress > 20_000) return "F-NO-PROGRESS";
      return ctx === "afterHand" ? "F-NEXT-HAND" : "F-NO-PROGRESS";
    };

    // 停止状態に入れる(オーバーレイ表示+5秒おきの自動再同期+診断スナップショットの定期更新)。
    const markStalled = (ctx: "inHand" | "afterHand" | "turnExpired") => {
      stallCtxRef.current = ctx;
      diagRef.current.stallReason = classifyStall(ctx);
      setData((d) => (d.tournamentOver ? d : { ...d, stalled: true, diag: { ...diagRef.current } }));
      if (!resyncTimerRef.current) {
        resyncTimerRef.current = setInterval(() => {
          forceResync();
          diagRef.current.stallReason = classifyStall(stallCtxRef.current);
          setData((d) => (d.stalled ? { ...d, diag: { ...diagRef.current } } : d));
        }, 5000);
      }
    };

    // ハンド中フリーズのウォッチドッグ。進行イベントが35秒途絶し、かつ次ハンド待ちでもなければ
    // 「停止」とみなし、診断オーバーレイ+自動再同期(resumeGame)を開始する。進行イベント受信の
    // たびに再武装するので、正常時は発火しない。
    // 自分の手番の長考(actingSeat===自席)は停止ではないため除外するが、手番タイマーの期限を
    // 15秒以上過ぎてもサーバーが時間切れ処理(自動チェック/フォールド)をしてこない場合は、
    // サーバー停止かゾンビ接続なので F-TURN-EXPIRED として停止扱いにする。
    const WATCHDOG_MS = 35_000;
    const TURN_EXPIRY_GRACE_MS = 15_000;
    const armWatchdog = (delayMs: number = WATCHDOG_MS) => {
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      activityTimerRef.current = setTimeout(() => {
        const ls = liveStateRef.current;
        if (!hasStartedRef.current || ls.over) return;
        // 自分の手番中: 長考は正常。ただし手番タイマー期限+猶予を過ぎても何も起きないのは異常。
        if (ls.actingSeatIndex !== null && ls.actingSeatIndex === ls.yourSeatIndex) {
          const turn = ls.lastTurn;
          if (turn && turn.seatIndex === ls.actingSeatIndex && Date.now() > turn.endsAt + TURN_EXPIRY_GRACE_MS) {
            markStalled("turnExpired");
          }
          // 自分の手番中は短い間隔で期限切れをチェックし続ける(タイムバンク延長はturnTimer再送で反映される)。
          armWatchdog(10_000);
          return;
        }
        // 次ハンド待ち(handEnded側の監視に委譲)は停止扱いしない。監視は継続。
        if (ls.isComplete) {
          armWatchdog();
          return;
        }
        // 他者/ボットの手番で進行が途絶 = 停止。オーバーレイを出し、5秒おきに再同期する。
        markStalled("inHand");
        armWatchdog();
      }, delayMs);
    };

    socket.on("connect", () => {
      diagRef.current.connectedAt = Date.now();
      setData((d) => ({ ...d, connected: true }));
      armWatchdog();
      // 初回は joinGame(新規参加)。以降の再接続は、対局開始後なら resumeGame(進行中の卓へ復帰。
      // 新しいSNG卓を勝手に立てない)、まだマッチング中ならもう一度 joinGame でキューへ再参加する。
      if (!hasJoinedRef.current) {
        hasJoinedRef.current = true;
        socket.emit("joinGame", { gameKey });
      } else if (hasStartedRef.current) {
        socket.emit("resumeGame");
      } else {
        socket.emit("joinGame", { gameKey });
      }
    });
    socket.on("disconnect", (reason: string) => {
      diagRef.current.disconnectedAt = Date.now();
      diagRef.current.disconnectReason = reason;
      setData((d) => ({ ...d, connected: false }));
    });
    // 進行中の卓が見つからない場合でも、絶対にホームへ強制退出させない(再接続で自動復帰を待つ)。
    socket.on("noActiveGame", () => setData((d) => ({ ...d, gameGone: true })));
    socket.on("joinGameError", (payload: { message: string }) =>
      setData((d) => ({ ...d, joinError: payload.message })),
    );
    socket.on("state", (state: PublicHandState) => {
      hasStartedRef.current = true;
      diagRef.current.lastStateAt = Date.now();
      liveStateRef.current = {
        ...liveStateRef.current,
        actingSeatIndex: state.actingSeatIndex,
        isComplete: state.isComplete,
      };
      armWatchdog();
      setData((d) => {
        const prev = d.state;
        // 新しいハンドの開始判定: 前のハンドが完了済み or ボードが減った(=次のハンドのプリフロップ)
        const isNewHand = !prev || prev.isComplete || state.board.length < prev.board.length;
        // アクションバッジは seatAction イベント側で管理する(ストリートを閉じる直前のアクションも
        // 一瞬表示できるように)。ここでは新しいハンドの開始時にだけクリアする。
        if (isNewHand) clearBadgeTimers();
        // 盤面が届いた=進行は生きている。停止監視(ハンド中/ハンド後とも)を解除する。
        // 注: ハンド終了後〜次ハンド開始までの間にstateが届くことはない(staged runoutのstateは
        // handEndedより前に届く)ため、ここで常に解除しても handEnded 側の15秒監視は妨げない。
        clearStallWatch();
        diagRef.current.stallReason = null;
        return {
          ...d,
          state,
          // 盤面が届いた=卓に戻れている。「進行中の卓が見つからない」通知は解除する。
          gameGone: false,
          lastHandEnded: isNewHand ? null : d.lastHandEnded,
          lastHandDeltaBySeat: isNewHand ? null : d.lastHandDeltaBySeat,
          runoutHoleCards: isNewHand ? null : d.runoutHoleCards,
          actionError: null,
          lastActionBySeat: isNewHand ? {} : d.lastActionBySeat,
          matching: null,
          waiting: null,
          tableNotice: isNewHand ? null : d.tableNotice,
          stalled: false,
        };
      });
    });
    socket.on("yourCards", (payload: { seatIndex: number; cards: string[] }) => {
      liveStateRef.current = { ...liveStateRef.current, yourSeatIndex: payload.seatIndex };
      setData((d) => ({ ...d, yourSeatIndex: payload.seatIndex, yourCards: payload.cards }));
    });
    socket.on(
      "players",
      (payload: {
        players: { seatIndex: number; userId?: string; displayName: string; avatarKey?: string | null; away?: boolean }[];
      }) =>
        setData((d) => ({
          ...d,
          players: Object.fromEntries(
            payload.players.map((p) => [
              p.seatIndex,
              {
                userId: p.userId ?? "",
                displayName: p.displayName,
                avatarKey: p.avatarKey ?? null,
                away: p.away ?? false,
              },
            ]),
          ),
        })),
    );
    socket.on("turnTimer", (payload: TurnTimerInfo) => {
      diagRef.current.lastTurnTimerAt = Date.now();
      liveStateRef.current = { ...liveStateRef.current, lastTurn: payload };
      armWatchdog();
      setData((d) => ({ ...d, turnTimer: payload }));
    });
    // 各席のアクション(bet/raise/call/check/fold/allIn)をアイコン脇のバッジに表示する。状態更新と
    // 独立して発火するため、ストリートを閉じるコール/チェックも消えずに一瞬表示される。一定時間後に消す。
    socket.on("seatAction", (payload: { seatIndex: number; kind: SeatActionKind; toAmount: number }) => {
      const { seatIndex, kind, toAmount } = payload;
      armWatchdog();
      setData((d) => ({ ...d, lastActionBySeat: { ...d.lastActionBySeat, [seatIndex]: { kind, toAmount } } }));
      const timers = badgeTimersRef.current;
      if (timers[seatIndex]) clearTimeout(timers[seatIndex]);
      timers[seatIndex] = setTimeout(() => {
        delete timers[seatIndex];
        setData((d) => {
          if (!(seatIndex in d.lastActionBySeat)) return d;
          const next = { ...d.lastActionBySeat };
          delete next[seatIndex];
          return { ...d, lastActionBySeat: next };
        });
      }, SEAT_ACTION_BADGE_MS);
    });
    socket.on("showdownReveal", (payload: { holeCards: Record<number, string[]> }) =>
      setData((d) => ({ ...d, runoutHoleCards: payload.holeCards })),
    );
    socket.on("handEnded", (payload: HandEndedPayload) =>
      setData((d) => {
        if (!d.state) return { ...d, lastHandEnded: payload };

        const lastHandDeltaBySeat: Record<number, number> = {};
        for (const seat of d.state.seats) {
          const payout = payload.result.payouts[seat.playerId] ?? 0;
          lastHandDeltaBySeat[seat.seatIndex] = payout - seat.handContribution;
        }

        let handHistory = d.handHistory;
        const heroCards = d.yourSeatIndex !== null ? payload.holeCards[d.yourSeatIndex] : undefined;
        const heroDelta = d.yourSeatIndex !== null ? lastHandDeltaBySeat[d.yourSeatIndex] : undefined;
        if (heroCards && heroCards.length === 2 && heroDelta !== undefined) {
          handHistory = [{ cards: heroCards, deltaChips: heroDelta }, ...d.handHistory].slice(0, 3);
        }

        // このゲームの全ハンド履歴を蓄積(フォールドしたハンドも含む)。自分は自分の手札を
        // 常に知っているため、まずd.yourCards、無ければ公開されたholeCardsを使う。
        let gameHandHistory = d.gameHandHistory;
        if (heroDelta !== undefined) {
          const recordCards = d.yourCards.length === 2 ? d.yourCards : heroCards ?? [];
          gameHandHistory = [
            ...d.gameHandHistory,
            { heroCards: recordCards, board: payload.result.board, delta: heroDelta, wonByFold: payload.result.wonByFold },
          ];
        }

        return { ...d, lastHandEnded: payload, lastHandDeltaBySeat, handHistory, gameHandHistory };
      }),
    );
    // ショウダウン後フリーズの監視: handEndedから15秒たっても次のハンドが始まらなければ
    // 停止と判定し、診断オーバーレイの表示と自動再同期(resumeGame)を開始する。
    // 正常時は次のstate(新ハンド)受信でclearStallWatchされるため何も起きない。
    socket.on("handEnded", () => {
      diagRef.current.lastHandEndedAt = Date.now();
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      stallTimerRef.current = setTimeout(() => markStalled("afterHand"), 15_000);
    });
    socket.on("levelUp", (payload: { level: LevelInfo; endsAt?: number }) =>
      setData((d) => ({ ...d, level: payload.level, levelEndsAt: payload.endsAt ?? null })),
    );
    socket.on("tournamentInfo", (payload: TournamentInfo) => setData((d) => ({ ...d, tournamentInfo: payload })));
    socket.on("chatLog", (payload: { messages: ChatMessage[] }) =>
      setData((d) => ({ ...d, chatLog: payload.messages })),
    );
    socket.on("chat", (msg: ChatMessage) => {
      setData((d) => ({
        ...d,
        chatLog: [...d.chatLog, msg].slice(-100),
        seatBubbles: { ...d.seatBubbles, [msg.seatIndex]: { text: msg.text, ts: msg.ts } },
      }));
      // 吹き出しは5秒で自動消去(同じtsのままなら消す)。
      setTimeout(() => {
        setData((d) => {
          const cur = d.seatBubbles[msg.seatIndex];
          if (!cur || cur.ts !== msg.ts) return d;
          const next = { ...d.seatBubbles };
          delete next[msg.seatIndex];
          return { ...d, seatBubbles: next };
        });
      }, 5000);
    });
    socket.on("tournamentOver", (payload: TournamentOverInfo) => {
      clearStallWatch();
      liveStateRef.current = { ...liveStateRef.current, over: true };
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
      setData((d) => ({ ...d, tournamentOver: payload, matching: null, waiting: null, stalled: false }));
    });
    // リエントリ成功: リザルト画面を閉じて卓へ戻す(直後のstate/players/levelUpで盤面が再描画される)。
    socket.on("reEntered", () => {
      setData((d) => ({ ...d, tournamentOver: null, gameGone: false }));
    });
    socket.on("tableNotice", (payload: { kind: string; message: string }) =>
      setData((d) => ({ ...d, tableNotice: payload })),
    );
    socket.on("actionError", (payload: { message: string }) =>
      setData((d) => ({ ...d, actionError: payload.message })),
    );
    socket.on("timeBank", (payload: TimeBankInfo) => setData((d) => ({ ...d, timeBank: payload })));
    socket.on("sngMatching", (payload: MatchingInfo) => setData((d) => ({ ...d, matching: payload })));
    socket.on("mttWaiting", (payload: WaitingInfo) => setData((d) => ({ ...d, waiting: payload })));

    // アプリ復帰(バックグラウンド→前面、タブ切替、ページ復帰、回線復帰)で必ず再アタッチする。
    // これが無いと、モバイルでタブが凍結された際にゾンビ接続のまま盤面が固まり復帰できない。
    const onForeground = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") forceResync();
    };
    const onOnline = () => forceResync({ immediate: true });
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onForeground);
    if (typeof window !== "undefined") {
      window.addEventListener("pageshow", onForeground);
      window.addEventListener("focus", onForeground);
      window.addEventListener("online", onOnline);
    }

    return () => {
      clearBadgeTimers();
      clearStallWatch();
      clearResyncFallback();
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onForeground);
      if (typeof window !== "undefined") {
        window.removeEventListener("pageshow", onForeground);
        window.removeEventListener("focus", onForeground);
        window.removeEventListener("online", onOnline);
      }
      socket.disconnect();
    };
  }, [displayName, avatarKey, gameKey, accessToken]);

  const sendAction = useCallback((action: PlayerAction) => {
    const s = socketRef.current;
    const sentAt = Date.now();
    const record = (patch: Partial<ActionDiag>) => {
      diagRef.current.lastAction = { kind: action.kind, sentAt, status: "pending", ...patch };
    };
    if (!s || !s.connected) {
      // 未接続のまま送信しても永久に何も起きない。即座に原因を表示し、再接続を試みる。
      diagRef.current.lastAction = { kind: action.kind, sentAt, status: "unsent" };
      setData((d) => ({
        ...d,
        actionError: "サーバー未接続のためアクションを送信できません [A-DISCONNECTED] 再接続しています…",
        diag: { ...diagRef.current },
      }));
      forceResyncRef.current?.({ immediate: true });
      return;
    }
    diagRef.current.lastAction = { kind: action.kind, sentAt, status: "pending" };
    // ACK(サーバーの受領応答)を要求して送る。6秒応答が無ければ「サーバーに届いていない/処理されていない」
    // と確定できるため、原因コードを表示して自動再同期する。
    s.timeout(6000).emit("action", action, (err: Error | null, res?: { ok: boolean; code: string }) => {
      const elapsed = Date.now() - sentAt;
      if (err) {
        record({ status: "timeout", ackElapsedMs: elapsed });
        setData((d) => ({
          ...d,
          actionError: "サーバーがアクションに応答しません [A-TIMEOUT] 再同期しています…",
          diag: { ...diagRef.current },
        }));
        forceResyncRef.current?.();
        return;
      }
      const code = res?.code ?? "UNKNOWN";
      record({ status: "acked", ackCode: code, ackElapsedMs: elapsed });
      if (res?.ok) return;
      // REJECTED(不正アクション)はサーバーが actionError で具体的な理由(エンジンのメッセージ)を
      // 別途送ってくるため、ここでは上書きしない。それ以外の「黙って無視」系は原因を明示する。
      if (code === "REJECTED") return;
      const detail = ACTION_ACK_MESSAGES[code] ?? "不明なエラーです";
      setData((d) => ({
        ...d,
        actionError: `${detail} [${code}] 再同期しています…`,
        diag: { ...diagRef.current },
      }));
      forceResyncRef.current?.();
    });
  }, []);

  /** 停止オーバーレイの「今すぐ再同期」ボタン用: 手動で即時再同期する。 */
  const resync = useCallback(() => {
    forceResyncRef.current?.({ immediate: true });
  }, []);

  /** チップを破棄してゲームから離脱する。 */
  const leaveGame = useCallback(() => {
    socketRef.current?.emit("leaveGame");
  }, []);

  /** タイムバンクカード使用のON/OFFを切り替える。 */
  const armTimeBank = useCallback((armed: boolean) => {
    socketRef.current?.emit("timeBankArm", { armed });
    setData((d) => (d.timeBank ? { ...d, timeBank: { ...d.timeBank, armed } } : d));
  }, []);

  /** 離席のON/OFFをサーバーに通知する(全員の座席に「離席中」を表示するため)。 */
  const setAway = useCallback((away: boolean) => {
    socketRef.current?.emit("sitOut", { away });
  }, []);

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed.length > 0) socketRef.current?.emit("chat", { text: trimmed });
  }, []);

  /** ハンドショウ: 自分の手札をハンド終了時に公開(ショウ)する意思をトグルする。 */
  const showCards = useCallback((show: boolean) => {
    socketRef.current?.emit("showCards", { show });
  }, []);

  /** MTTリエントリ: バスト済みからレジクローズ前に-2,000で復帰する。 */
  const reEntry = useCallback(() => {
    socketRef.current?.emit("reEntry");
  }, []);

  return { ...data, sendAction, leaveGame, armTimeBank, setAway, sendChat, showCards, reEntry, resync };
}
