import { describe, expect, it } from "vitest";
import { FRIEND_BOT_NAME_PREFIX, pickBotProfiles } from "../src/gameServer.js";

/** フレンド対戦の「ボット1」〜の名前は、通常の対戦の自動の席の名前と絶対に重ならない(オーナー指示 2026-11-05)。 */
describe("自動の席の名前", () => {
  it("通常の名前に「ボット」で始まる名前・bot を含む名前が無い", () => {
    const names = pickBotProfiles(2000).map((p) => p.name);
    for (const n of names) {
      expect(n.startsWith(FRIEND_BOT_NAME_PREFIX)).toBe(false);
      expect(/bot|ボット|ﾎﾞｯﾄ/i.test(n)).toBe(false);
    }
  });
});
