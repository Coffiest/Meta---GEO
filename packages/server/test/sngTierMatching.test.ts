import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server, Socket } from "socket.io";
import type { PlayerAction } from "@meta-geo/engine";
import { ACTION_CLOCK_MS, botDecisionMs } from "../src/gameServer.js";
import { SngMatchmaker } from "../src/sngMatchmaker.js";

/**
 * High Roller / Super High Roller の卓のきまり。
 * - 空き席を自動で埋めない(6人そろうまで始まらない)
 * - タイムバンクの無い卓では、自動プレイヤーも延長して考える演出をしない(人間と違いが出ないように)
 */

function fakeSocket() {
  const emitted: { event: string; payload: unknown }[] = [];
  const socket = {
    emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
    on: () => socket,
  };
  return { socket: socket as unknown as Socket, emitted };
}

describe("High Roller の待合室", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("1人だけでは、どれだけ待っても自動で卓が埋まって始まることはない", () => {
    const ready = vi.fn();
    const m = new SngMatchmaker({} as Server, ready, "highRoller");
    const { socket, emitted } = fakeSocket();
    m.join({ userId: "u1", displayName: "A", avatarKey: null }, socket);
    vi.advanceTimersByTime(120_000);
    expect(ready).not.toHaveBeenCalled();
    const last = emitted.filter((e) => e.event === "sngMatching").at(-1)!.payload as { registered: number; secondsLeft: number | null };
    // 表示は並んでいる人数のまま、残り秒数の表示も無い。
    expect(last).toMatchObject({ registered: 1, needed: 6, secondsLeft: null });
  });

  it("並んだあとはいつでも取り消せる", () => {
    const m = new SngMatchmaker({} as Server, vi.fn(), "superHighRoller");
    const { socket } = fakeSocket();
    m.join({ userId: "u1", displayName: "A", avatarKey: null }, socket);
    expect(m.isQueued("u1")).toBe(true);
    m.leaveQueue("u1");
    expect(m.isQueued("u1")).toBe(false);
  });
});

describe("タイムバンクの無い卓の自動プレイヤー", () => {
  it("どのストリートでも持ち時間(20秒)の中で必ず動く", () => {
    const actions: PlayerAction[] = [{ kind: "call" }, { kind: "fold" }, { kind: "raise", toAmount: 600 }];
    let max = 0;
    for (let i = 0; i < 20_000; i++) {
      for (const street of ["turn", "river"]) {
        max = Math.max(max, botDecisionMs(street, actions[i % actions.length]!, Math.random, false));
      }
    }
    expect(max).toBeLessThanOrEqual(ACTION_CLOCK_MS);
  });
});
