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
  /** 対象プレイヤーのUser.id。相手タップ時の詳細モーダル/メモ取得に使う。BOTは合成ID。 */
  userId: string;
  displayName: string;
  avatarKey: string | null;
  isBot: boolean;
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

/** トーナメントクロック画面用の集計情報(サーバーのbroadcastTournamentInfoから)。 */
export interface TournamentInfo {
  /** 生き残っている人数。 */
  remaining: number;
  /** 総エントリー数。 */
  total: number;
  /** アベレージスタック(生存者の平均持ち点)。 */
  averageStack: number;
  /** プライズ(ペイアウト)構造。 */
  prizePool: PrizePlace[];
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
}

const SOCKET_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

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
  });

  // ショウダウン後フリーズの監視タイマー。handEndedから一定時間ハンドが進まなければ
  // stalled=true にして診断オーバーレイを出し、以降5秒おきに resumeGame で再同期を試みる。
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ハンド"中"フリーズの監視。サーバーからの進行イベント(state/turnTimer/seatAction)が一定時間
  // 途絶えたら停止とみなし、自動再同期する。自分の手番の長考は誤検知しないよう除外する。
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ウォッチドッグ判定用に最新の手番/自席/完了状態を保持する(タイマー発火時に参照)。
  const liveStateRef = useRef<{ actingSeatIndex: number | null; yourSeatIndex: number | null; isComplete: boolean; over: boolean }>(
    { actingSeatIndex: null, yourSeatIndex: null, isComplete: false, over: false },
  );

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
    });
    socketRef.current = socket;

    // ハンド中フリーズのウォッチドッグ。進行イベントが35秒途絶し、かつ自分の手番でも次ハンド待ちでも
    // なければ「停止」とみなし、診断オーバーレイ+自動再同期(resumeGame)を開始する。進行イベント受信の
    // たびに再武装するので、正常時は発火しない。自分の手番の長考(actingSeat===自席)は停止ではないため除外。
    const WATCHDOG_MS = 35_000;
    const armWatchdog = () => {
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      activityTimerRef.current = setTimeout(() => {
        const ls = liveStateRef.current;
        if (!hasStartedRef.current || ls.over) return;
        // 自分の手番の長考、または次ハンド待ち(handEnded側の監視に委譲)は停止扱いしない。監視は継続。
        if ((ls.actingSeatIndex !== null && ls.actingSeatIndex === ls.yourSeatIndex) || ls.isComplete) {
          armWatchdog();
          return;
        }
        // 他者/ボットの手番で進行が途絶 = 停止。オーバーレイを出し、5秒おきに再同期する。
        setData((d) => (d.tournamentOver ? d : { ...d, stalled: true }));
        if (!resyncTimerRef.current) {
          resyncTimerRef.current = setInterval(() => {
            if (socket.connected) socket.emit("resumeGame");
            else socket.connect();
          }, 5000);
        }
        armWatchdog();
      }, WATCHDOG_MS);
    };

    socket.on("connect", () => {
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
    socket.on("disconnect", () => setData((d) => ({ ...d, connected: false })));
    // 進行中の卓が見つからない場合でも、絶対にホームへ強制退出させない(再接続で自動復帰を待つ)。
    socket.on("noActiveGame", () => setData((d) => ({ ...d, gameGone: true })));
    socket.on("joinGameError", (payload: { message: string }) =>
      setData((d) => ({ ...d, joinError: payload.message })),
    );
    socket.on("state", (state: PublicHandState) => {
      hasStartedRef.current = true;
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
        // 新しいハンドが始まった=進行は生きている。停止監視を解除する。
        if (isNewHand) clearStallWatch();
        return {
          ...d,
          state,
          lastHandEnded: isNewHand ? null : d.lastHandEnded,
          lastHandDeltaBySeat: isNewHand ? null : d.lastHandDeltaBySeat,
          runoutHoleCards: isNewHand ? null : d.runoutHoleCards,
          actionError: null,
          lastActionBySeat: isNewHand ? {} : d.lastActionBySeat,
          matching: null,
          waiting: null,
          tableNotice: isNewHand ? null : d.tableNotice,
          stalled: isNewHand ? false : d.stalled,
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
        players: { seatIndex: number; userId?: string; displayName: string; avatarKey?: string | null; isBot?: boolean; away?: boolean }[];
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
                isBot: p.isBot ?? false,
                away: p.away ?? false,
              },
            ]),
          ),
        })),
    );
    socket.on("turnTimer", (payload: TurnTimerInfo) => {
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
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      stallTimerRef.current = setTimeout(() => {
        setData((d) => (d.tournamentOver ? d : { ...d, stalled: true }));
        if (resyncTimerRef.current) clearInterval(resyncTimerRef.current);
        resyncTimerRef.current = setInterval(() => {
          if (socket.connected) socket.emit("resumeGame");
          else socket.connect();
        }, 5000);
      }, 15_000);
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
    socket.on("tableNotice", (payload: { kind: string; message: string }) =>
      setData((d) => ({ ...d, tableNotice: payload })),
    );
    socket.on("actionError", (payload: { message: string }) =>
      setData((d) => ({ ...d, actionError: payload.message })),
    );
    socket.on("timeBank", (payload: TimeBankInfo) => setData((d) => ({ ...d, timeBank: payload })));
    socket.on("sngMatching", (payload: MatchingInfo) => setData((d) => ({ ...d, matching: payload })));
    socket.on("mttWaiting", (payload: WaitingInfo) => setData((d) => ({ ...d, waiting: payload })));

    return () => {
      clearBadgeTimers();
      clearStallWatch();
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
      socket.disconnect();
    };
  }, [displayName, avatarKey, gameKey, accessToken]);

  const sendAction = useCallback((action: PlayerAction) => {
    socketRef.current?.emit("action", action);
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

  return { ...data, sendAction, leaveGame, armTimeBank, setAway, sendChat, showCards };
}
