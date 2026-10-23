"use client";

import { useEffect, useState } from "react";
import { parseCard, type Card } from "@meta-geo/engine/src/types/card.js";

/** 未知カードが3枚以上(プリフロップのオールイン)のときの試行回数。誤差はおよそ1%。 */
const SAMPLES = 4000;

/**
 * 手札が開いた席どうしの、いまのボードからの勝率(引き分けは山分け)。
 * 手札が2席以上そろわないとき・リバーまで開いたときは null(勝ち負けの表示に任せる)。
 */
export function useRunoutEquity(hands: Record<number, (string | null)[]> | null, board: readonly string[]): Record<number, number> | null {
  const key = hands ? JSON.stringify(hands) + "|" + board.join(",") : "";
  const [result, setResult] = useState<{ key: string; equity: Record<number, number> } | null>(null);

  useEffect(() => {
    if (!hands || board.length >= 5) return;
    const contenders: { id: string; holeCards: [Card, Card] }[] = [];
    for (const [seat, cards] of Object.entries(hands)) {
      const parsed = cards.map((c) => (c ? parseCard(c) : null));
      if (parsed.length === 2 && parsed[0] && parsed[1]) contenders.push({ id: seat, holeCards: [parsed[0], parsed[1]] });
    }
    const knownBoard = board.map(parseCard).filter((c): c is Card => !!c);
    if (contenders.length < 2) return;
    // プリフロップでは端末によって1秒近くかかるので、別スレッドで計算する。
    const worker = new Worker(new URL("./equityWorker.ts", import.meta.url));
    worker.onmessage = (e: MessageEvent<{ key: string; equity: Record<number, number> }>) => {
      setResult(e.data);
      worker.terminate();
    };
    worker.postMessage({ key, input: { contenders, knownBoard, samples: SAMPLES } });
    return () => worker.terminate();
    // key に hands と board の中身がすべて入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!hands || board.length >= 5) return null;
  return result?.key === key ? result.equity : null;
}

/** 表示用: 0.623 → "62%"。 */
export function formatEquity(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** 降りずに残っている席の、見えている手札だけを集める(観戦・リプレイの常時表示用)。 */
export function liveHands(
  seats: readonly { seatIndex: number; status: string }[] | undefined,
  known: Record<number, (string | null)[]> | null,
): Record<number, (string | null)[]> | null {
  if (!seats || !known) return null;
  const out: Record<number, (string | null)[]> = {};
  for (const s of seats) {
    if (s.status !== "active" && s.status !== "allIn") continue;
    const cards = known[s.seatIndex];
    if (cards) out[s.seatIndex] = cards;
  }
  return out;
}
