import { describe, expect, it } from "vitest";
import { activeGames } from "../src/activeGames.js";
import { presenceSnapshot, touchPresence } from "../src/presence.js";

describe("管理者画面のアクティブユーザー", () => {
  it("最近見えた人と、卓で遊んでいる人を数える(遊んでいる人を先に並べる)", async () => {
    touchPresence("u-home", "ホームの人");
    activeGames.setActive("u-table", "sng");
    const snap = await presenceSnapshot(async (ids) => new Map(ids.map((id) => [id, `名前:${id}`])));
    const ids = snap.users.map((u) => u.userId);
    expect(ids).toContain("u-home");
    expect(ids).toContain("u-table");
    expect(snap.users[0]!.userId).toBe("u-table");
    expect(snap.users.find((u) => u.userId === "u-table")!.displayName).toBe("名前:u-table");
    expect(snap.playingCount).toBeGreaterThanOrEqual(1);
    expect(snap.activeCount).toBe(snap.users.length);
    activeGames.clearActive("u-table");
  });
});
