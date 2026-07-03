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

export interface PokerSocketState {
  connected: boolean;
  spectating: boolean;
  state: PublicHandState | null;
  yourSeatIndex: number | null;
  yourCards: string[];
  lastHandEnded: HandEndedPayload | null;
  level: LevelInfo | null;
  tournamentOver: { winnerPlayerId: string | null } | null;
  actionError: string | null;
  players: Record<number, string>;
  handHistory: HandHistoryEntry[];
  /** 今のストリートで各座席が最後に行ったアクション(街が変わる/新ハンドが始まると消える) */
  lastActionBySeat: Record<number, SeatAction>;
  /** 直近に終わったハンドの、座席ごとの収支(次のハンドの最初のstateが来るまで表示用に保持) */
  lastHandDeltaBySeat: Record<number, number> | null;
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
      if (seat.status === "allIn") {
        result[seat.seatIndex] = { kind: "allIn", toAmount: seat.streetContribution };
      } else if (seat.streetContribution > prev.currentBetToMatch) {
        result[seat.seatIndex] = { kind: wasFacingBet ? "raise" : "bet", toAmount: seat.streetContribution };
      } else if (wasFacingBet) {
        result[seat.seatIndex] = { kind: "call", toAmount: seat.streetContribution };
      }
    } else if (seat.hasActedThisStreet && !prevSeat.hasActedThisStreet && seat.streetContribution === 0) {
      result[seat.seatIndex] = { kind: "check", toAmount: 0 };
    }
  }
  return result;
}

export function usePokerSocket(displayName: string) {
  const socketRef = useRef<Socket | null>(null);
  const [data, setData] = useState<PokerSocketState>({
    connected: false,
    spectating: false,
    state: null,
    yourSeatIndex: null,
    yourCards: [],
    lastHandEnded: null,
    level: null,
    tournamentOver: null,
    actionError: null,
    players: {},
    handHistory: [],
    lastActionBySeat: {},
    lastHandDeltaBySeat: null,
  });

  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { displayName }, transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => setData((d) => ({ ...d, connected: true })));
    socket.on("disconnect", () => setData((d) => ({ ...d, connected: false })));
    socket.on("spectating", () => setData((d) => ({ ...d, spectating: true })));
    socket.on("state", (state: PublicHandState) =>
      setData((d) => {
        const prev = d.state;
        const isNewHandOrStreet = !prev || prev.isComplete || prev.board.length !== state.board.length;
        const lastActionBySeat = isNewHandOrStreet ? {} : diffSeatActions(prev, state);
        return {
          ...d,
          state,
          lastHandEnded: null,
          lastHandDeltaBySeat: null,
          actionError: null,
          lastActionBySeat,
        };
      }),
    );
    socket.on("yourCards", (payload: { seatIndex: number; cards: string[] }) =>
      setData((d) => ({ ...d, yourSeatIndex: payload.seatIndex, yourCards: payload.cards })),
    );
    socket.on("players", (payload: { players: { seatIndex: number; displayName: string }[] }) =>
      setData((d) => ({
        ...d,
        players: Object.fromEntries(payload.players.map((p) => [p.seatIndex, p.displayName])),
      })),
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

        return { ...d, lastHandEnded: payload, lastHandDeltaBySeat, handHistory };
      }),
    );
    socket.on("levelUp", (payload: { level: LevelInfo }) => setData((d) => ({ ...d, level: payload.level })));
    socket.on("tournamentOver", (payload: { winnerPlayerId: string | null }) =>
      setData((d) => ({ ...d, tournamentOver: payload })),
    );
    socket.on("actionError", (payload: { message: string }) =>
      setData((d) => ({ ...d, actionError: payload.message })),
    );

    return () => {
      socket.disconnect();
    };
  }, [displayName]);

  const sendAction = useCallback((action: PlayerAction) => {
    socketRef.current?.emit("action", action);
  }, []);

  return { ...data, sendAction };
}
