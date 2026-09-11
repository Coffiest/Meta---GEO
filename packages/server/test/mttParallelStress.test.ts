import { describe, expect, it } from "vitest";
import { MultiTableTournament, STARTING_STACK, type Card, type HandEngine } from "@meta-geo/engine";
import { decideBotAction } from "../src/bot.js";

/**
 * 本番サーバー(mttSession)の「全卓並行進行」を忠実に再現するストレスシミュレーション。
 * 各卓が独立にハンドを進め、精算時に busyTableIds(他卓の進行中集合)を渡してリバランスする。
 * レイトレジ・強制敗退(離脱)・リエントリもランダムに混ぜ、以下を検証する:
 *  1. エンジン呼び出しが一切例外を投げない(本番では未捕捉例外=プロセス死=全員切断)
 *  2. リバランスが進行中(busy)卓の席を絶対に動かさない
 *  3. 進行が止まらない(スタール検出)
 *  4. 終了時にチップが保存される(勝者スタック=全エントリー×開始スタック)
 */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sim {
  readonly mtt: MultiTableTournament;
  readonly hands: Map<number, HandEngine>; // tableId -> 進行中ハンド
  readonly rand: () => number;
  entries: number;
  handsPlayed: number;
}

function busyIds(sim: Sim, exclude?: number): ReadonlySet<number> {
  const s = new Set<number>();
  for (const [tid, h] of sim.hands) {
    if (tid !== exclude && !h.isHandComplete()) s.add(tid);
  }
  return s;
}

/** 進行中卓の席スナップショット(リバランスがbusy卓を動かしていないことの検証用)。 */
function snapshotBusy(sim: Sim, exclude?: number): Map<number, string> {
  const snap = new Map<number, string>();
  for (const tid of busyIds(sim, exclude)) {
    const occ = sim.mtt
      .getTableOccupancy(tid)
      .map((o) => `${o.seatIndex}:${o.playerId}`)
      .sort()
      .join(",");
    snap.set(tid, occ);
  }
  return snap;
}

function applyOneAction(sim: Sim, tableId: number): void {
  const hand = sim.hands.get(tableId)!;
  const seatIndex = hand.getActingSeatIndex();
  if (seatIndex === null) {
    // 未完了なのに手番が無い=進行不能ハンド。本番ではこの状態が卓の永久凍結になるため検出する。
    throw new Error(
      `no acting seat but hand incomplete on table ${tableId}: street=${hand.getPublicState().street} seats=${JSON.stringify(
        hand.getPublicState().seats.map((s) => ({ i: s.seatIndex, st: s.status, stack: s.stack })),
      )}`,
    );
  }
  const state = hand.getPublicState();
  const seat = state.seats.find((s) => s.seatIndex === seatIndex)!;
  const isHuman = seat.playerId.startsWith("human");
  let action;
  if (isHuman) {
    // 本番の離席人間と同じ: チェックできればチェック、でなければフォールド
    const toCall = state.currentBetToMatch - seat.streetContribution;
    action = toCall <= 0 ? ({ kind: "check" } as const) : ({ kind: "fold" } as const);
  } else {
    action = decideBotAction({
      street: state.street,
      holeCards: hand.getSeatHoleCards(seatIndex) as unknown as readonly [Card, Card],
      board: state.board,
      currentBetToMatch: state.currentBetToMatch,
      streetContribution: seat.streetContribution,
      minRaiseToAmount: hand.getMinRaiseToAmount(),
      potBefore: state.potTotal,
      stack: seat.stack,
      canRaise: !seat.hasActedThisStreet,
      activeOpponentCount: state.seats.filter((s) => s.seatIndex !== seatIndex && (s.status === "active" || s.status === "allIn")).length,
      bigBlind: sim.mtt.getCurrentLevel().bigBlind,
      random: sim.rand,
    });
  }
  try {
    hand.applyAction(seatIndex, action);
  } catch {
    hand.applyAction(seatIndex, { kind: "fold" });
  }
}

function runSeed(seed: number): void {
  const rand = mulberry32(seed);
  const initialCount = 2 + Math.floor(rand() * 12); // 2〜13人で開始
  const players = Array.from({ length: initialCount }, (_, i) => ({
    playerId: i === 0 ? `human-${i}` : `bot-${i}`,
    displayName: `P${i}`,
  }));
  const mtt = new MultiTableTournament({ tableSeatCount: 6, players });
  const sim: Sim = { mtt, hands: new Map(), rand, entries: initialCount, handsPlayed: 0 };
  const FIELD_CAP = 21;
  let lateId = 1000;
  let regOpen = true;
  let stall = 0;
  // forceEliminate(離脱)はそのプレイヤーのスタックごと場から取り除く仕様のため、
  // チップ保存の期待値からも差し引いて追跡する。
  let removedChips = 0;

  for (let step = 0; step < 400_000; step++) {
    if (mtt.isTournamentOver()) break;

    // レジ期間: たまにレイトレジ/リエントリ(本番: registerLatePlayer + busyTableIds)
    if (regOpen && rand() < 0.002 && mtt.totalRemainingPlayers() < FIELD_CAP) {
      const before = snapshotBusy(sim);
      mtt.registerLatePlayer({ playerId: `bot-${lateId}`, displayName: `L${lateId}` }, busyIds(sim));
      lateId++;
      sim.entries++;
      for (const [tid, occ] of before) {
        const now = sim.mtt.getTableOccupancy(tid).map((o) => `${o.seatIndex}:${o.playerId}`).sort().join(",");
        expect(now, `late reg moved seats on busy table ${tid} (seed=${seed}, step=${step})`).toBe(occ);
      }
    }
    if (regOpen && sim.handsPlayed > 60) regOpen = false; // レジクロ相当

    // 進行できる卓を列挙: (a)進行中ハンドに1アクション (b)待機卓の新規ハンド開始
    const actable: number[] = [];
    const startable: number[] = [];
    for (const tid of mtt.getTableIds()) {
      const h = sim.hands.get(tid);
      if (h && !h.isHandComplete()) actable.push(tid);
      else if (mtt.getTableOccupancy(tid).length >= 2) startable.push(tid);
    }

    if (actable.length === 0 && startable.length === 0) {
      // 全卓待機なのに誰も開始できない=リバランス漏れのスタール
      stall++;
      expect(stall, `stalled: no table can act or start (seed=${seed}, step=${step}, tables=${JSON.stringify(mtt.getTableIds().map((t) => mtt.getTableOccupancy(t).length))}, remaining=${mtt.totalRemainingPlayers()})`).toBeLessThan(3);
      continue;
    }
    stall = 0;

    // ランダムに1卓選び1手進める(本番の並行インターリーブを再現)
    const pool = [...actable, ...startable];
    const tid = pool[Math.floor(rand() * pool.length)]!;
    if (actable.includes(tid)) {
      applyOneAction(sim, tid);
      const h = sim.hands.get(tid)!;
      if (h.isHandComplete()) {
        sim.hands.delete(tid); // 本番: rt.hand = null にしてから精算
        const before = snapshotBusy(sim, tid);
        mtt.settleFinishedHandOnTable(tid, h, busyIds(sim, tid));
        sim.handsPlayed++;
        if (sim.handsPlayed % 15 === 0) mtt.advanceToNextLevel();
        for (const [btid, occ] of before) {
          const now = sim.mtt.getTableOccupancy(btid).map((o) => `${o.seatIndex}:${o.playerId}`).sort().join(",");
          expect(now, `settle rebalance moved seats on busy table ${btid} (seed=${seed}, step=${step})`).toBe(occ);
        }
      }
    } else {
      const h = mtt.startNextHandOnTable(tid);
      if (h.isHandComplete()) {
        // 開始と同時に完了(全員オールインの配剥け)。本番サーバー(pumpTable)と同じく即精算する。
        const before = snapshotBusy(sim, tid);
        mtt.settleFinishedHandOnTable(tid, h, busyIds(sim, tid));
        sim.handsPlayed++;
        if (sim.handsPlayed % 15 === 0) mtt.advanceToNextLevel();
        for (const [btid, occ] of before) {
          const now = sim.mtt.getTableOccupancy(btid).map((o) => `${o.seatIndex}:${o.playerId}`).sort().join(",");
          expect(now, `born-complete settle moved seats on busy table ${btid} (seed=${seed}, step=${step})`).toBe(occ);
        }
      } else {
        sim.hands.set(tid, h);
      }
    }

    // まれに強制敗退(プレイ中の人間の離脱相当)。busy卓の席は動かさない前提のAPI。
    if (rand() < 0.0008) {
      const all = mtt.getTableIds().flatMap((t) => mtt.getTableOccupancy(t).map((o) => o.playerId));
      const target = all[Math.floor(rand() * all.length)];
      if (target) {
        const targetTable = mtt.getTableIds().find((t) => mtt.getTableOccupancy(t).some((o) => o.playerId === target));
        const targetBusy = targetTable !== undefined && sim.hands.has(targetTable);
        if (!targetBusy) {
          const before = snapshotBusy(sim);
          const targetStack =
            targetTable !== undefined
              ? mtt.getTableOccupancy(targetTable).find((o) => o.playerId === target)?.stack ?? 0
              : 0;
          removedChips += targetStack;
          mtt.forceEliminate(target, busyIds(sim));
          for (const [btid, occ] of before) {
            const now = sim.mtt.getTableOccupancy(btid).map((o) => `${o.seatIndex}:${o.playerId}`).sort().join(",");
            expect(now, `forceEliminate moved seats on busy table ${btid} (seed=${seed}, step=${step})`).toBe(occ);
          }
        }
      }
    }
  }

  expect(mtt.isTournamentOver(), `tournament did not finish (seed=${seed})`).toBe(true);
  // チップ保存: 勝者のスタック=全エントリー×開始スタック
  const winner = mtt.getWinnerPlayerId();
  expect(winner).not.toBeNull();
  const tables = mtt.getTableIds();
  const total = tables.reduce((sum, t) => sum + mtt.getTableOccupancy(t).reduce((s, o) => s + o.stack, 0), 0);
  expect(total, `chips not conserved (seed=${seed}, entries=${sim.entries}, removed=${removedChips})`).toBe(
    sim.entries * STARTING_STACK - removedChips,
  );
}

describe("MTT parallel-table stress (production driving pattern)", () => {
  it("survives 12 random seeds without exceptions, stalls, busy-table mutation, or chip loss", () => {
    for (let seed = 1; seed <= 12; seed++) {
      process.stdout.write(`seed ${seed}...\n`);
      runSeed(seed);
    }
  }, 600_000);
});
