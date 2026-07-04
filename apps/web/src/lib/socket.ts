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

export type SeatActionKind = "bet" | "raise" | "call" | "check" | "fold" | "allIn";

export interface SeatAction {
  kind: SeatActionKind;
  toAmount: number;
}

export interface SeatPlayerInfo {
  displayName: string;
  avatarKey: string | null;
  isBot: boolean;
}

export interface TurnTimerInfo {
  seatIndex: number;
  endsAt: number;
  durationMs: number;
}

export interface TournamentOverInfo {
  winnerPlayerId: string | null;
  yourFinishPosition: number | null;
  yourPayout: number;
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
  tournamentOver: TournamentOverInfo | null;
  actionError: string | null;
  players: Record<number, SeatPlayerInfo>;
  handHistory: HandHistoryEntry[];
  /** ハンド中の各座席の最後のアクション(新しいハンドが始まるまで表示し続ける) */
  lastActionBySeat: Record<number, SeatAction>;
  /** 直近に終わったハンドの、座席ごとの収支(次のハンドの最初のstateが来るまで表示用に保持) */
  lastHandDeltaBySeat: Record<number, number> | null;
  /** アクティブ席の持ち時間(アバター周囲のリング表示用) */
  turnTimer: TurnTimerInfo | null;
  /** ゲーム参加(joinGame)が失敗した場合のエラーメッセージ */
  joinError: string | null;
}

const SOCKET_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

/**
 * 直前のstateと新しいstateを比較し、各座席が「レイズ/コール/チェック/フォールド」のどれを
 * 行ったかを推定する。ブラインドの強制ポスト(hasActedThisStreetがfalseのまま)は除外される。
 */
function diffSeatActions(prev: PublicHandState, next: PublicHandState): Record<number, SeatAction> {
  const result: Record<number, SeatAction> = {};
  for (const seat of next.seats) {
    const prevSeat = prev.seats.find((s) => s.seatIndex === seat.seatIndex);
    if (!prevSeat) continue;

    if (seat.status === "folded" && prevSeat.status !== "folded") {
      result[seat.seatIndex] = { kind: "fold", toAmount: 0 };
    } else if (seat.streetContribution !== prevSeat.streetContribution) {
      const wasFacingBet = prev.currentBetToMatch > 0;
      // プリフロップはブラインド自体が「最初のベット」に相当するため、そこへの追加アクションは
      // 常にレイズ表記にする(ポストフロップだけ最初のアグレッションを「ベット」と呼ぶ)。
      const isPreflop = next.street === "preflop";
      if (seat.status === "allIn") {
        result[seat.seatIndex] = { kind: "allIn", toAmount: seat.streetContribution };
      } else if (seat.streetContribution > prev.currentBetToMatch) {
        result[seat.seatIndex] = { kind: isPreflop || wasFacingBet ? "raise" : "bet", toAmount: seat.streetContribution };
      } else if (wasFacingBet) {
        result[seat.seatIndex] = { kind: "call", toAmount: seat.streetContribution };
      }
    } else if (seat.hasActedThisStreet && !prevSeat.hasActedThisStreet && seat.streetContribution === 0) {
      result[seat.seatIndex] = { kind: "check", toAmount: 0 };
    }
  }
  return result;
}

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
  const [data, setData] = useState<PokerSocketState>({
    connected: false,
    spectating: false,
    state: null,
    yourSeatIndex: null,
    yourCards: [],
    lastHandEnded: null,
    level: null,
    levelEndsAt: null,
    tournamentOver: null,
    actionError: null,
    players: {},
    handHistory: [],
    lastActionBySeat: {},
    lastHandDeltaBySeat: null,
    turnTimer: null,
    joinError: null,
  });

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: { displayName, avatarKey, accessToken },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setData((d) => ({ ...d, connected: true }));
      socket.emit("joinGame", { gameKey });
    });
    socket.on("disconnect", () => setData((d) => ({ ...d, connected: false })));
    socket.on("joinGameError", (payload: { message: string }) =>
      setData((d) => ({ ...d, joinError: payload.message })),
    );
    socket.on("state", (state: PublicHandState) =>
      setData((d) => {
        const prev = d.state;
        // 新しいハンドの開始判定: 前のハンドが完了済み or ボードが減った(=次のハンドのプリフロップ)
        const isNewHand = !prev || prev.isComplete || state.board.length < prev.board.length;
        // アクションバッジはハンド中ずっと表示し続ける。ストリートが変わった瞬間の
        // streetContributionリセットを誤検知しないよう、同一ストリート内でのみ差分を取る。
        const lastActionBySeat = isNewHand
          ? {}
          : prev.street !== state.street
            ? d.lastActionBySeat
            : { ...d.lastActionBySeat, ...diffSeatActions(prev, state) };
        return {
          ...d,
          state,
          lastHandEnded: isNewHand ? null : d.lastHandEnded,
          lastHandDeltaBySeat: isNewHand ? null : d.lastHandDeltaBySeat,
          actionError: null,
          lastActionBySeat,
        };
      }),
    );
    socket.on("yourCards", (payload: { seatIndex: number; cards: string[] }) =>
      setData((d) => ({ ...d, yourSeatIndex: payload.seatIndex, yourCards: payload.cards })),
    );
    socket.on(
      "players",
      (payload: { players: { seatIndex: number; displayName: string; avatarKey?: string | null; isBot?: boolean }[] }) =>
        setData((d) => ({
          ...d,
          players: Object.fromEntries(
            payload.players.map((p) => [
              p.seatIndex,
              { displayName: p.displayName, avatarKey: p.avatarKey ?? null, isBot: p.isBot ?? false },
            ]),
          ),
        })),
    );
    socket.on("turnTimer", (payload: TurnTimerInfo) => setData((d) => ({ ...d, turnTimer: payload })));
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

        return { ...d, lastHandEnded: payload, lastHandDeltaBySeat, handHistory };
      }),
    );
    socket.on("levelUp", (payload: { level: LevelInfo; endsAt?: number }) =>
      setData((d) => ({ ...d, level: payload.level, levelEndsAt: payload.endsAt ?? null })),
    );
    socket.on("tournamentOver", (payload: TournamentOverInfo) =>
      setData((d) => ({ ...d, tournamentOver: payload })),
    );
    socket.on("actionError", (payload: { message: string }) =>
      setData((d) => ({ ...d, actionError: payload.message })),
    );

    return () => {
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

  return { ...data, sendAction, leaveGame };
}
