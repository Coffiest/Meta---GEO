import { describe, expect, it } from "vitest";
import { networkPrefix } from "../src/lobbyApi.js";

describe("招待の接続元のそろえ方", () => {
  it("IPv4 はそのまま、IPv4 を埋め込んだ IPv6 は IPv4 に戻す", () => {
    expect(networkPrefix("203.0.113.7")).toBe("203.0.113.7");
    expect(networkPrefix("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("IPv6 は先頭 64bit(同じ家の端末どうしで同じになる)", () => {
    const a = networkPrefix("2001:db8:abcd:12:1111:2222:3333:4444");
    const b = networkPrefix("2001:0db8:abcd:0012::99");
    expect(a).toBe("2001:db8:abcd:12");
    expect(b).toBe(a);
    expect(networkPrefix("2001:db8::1")).toBe("2001:db8:0:0");
  });
});
