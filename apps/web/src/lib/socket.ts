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
}

const SOCKET_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

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
  });

  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { displayName }, transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => setData((d) => ({ ...d, connected: true })));
    socket.on("disconnect", () => setData((d) => ({ ...d, connected: false })));
    socket.on("spectating", () => setData((d) => ({ ...d, spectating: true })));
    socket.on("state", (state: PublicHandState) =>
      setData((d) => ({ ...d, state, lastHandEnded: null, actionError: null })),
    );
    socket.on("yourCards", (payload: { seatIndex: number; cards: string[] }) =>
      setData((d) => ({ ...d, yourSeatIndex: payload.seatIndex, yourCards: payload.cards })),
    );
    socket.on("handEnded", (payload: HandEndedPayload) => setData((d) => ({ ...d, lastHandEnded: payload })));
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
