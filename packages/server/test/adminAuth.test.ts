import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import { checkAdminAuth, isValidUnlockCode } from "../src/adminAuth.js";

/** x-admin-passcode ヘッダとIPだけを持つ最小の擬似リクエストを作る。 */
function req(passcode: string | undefined, ip: string): IncomingMessage {
  return {
    headers: {
      ...(passcode !== undefined ? { "x-admin-passcode": passcode } : {}),
      "x-forwarded-for": ip,
    },
    socket: { remoteAddress: ip },
  } as unknown as IncomingMessage;
}

describe("adminAuth", () => {
  const prev = process.env["ADMIN_PASSCODE"];
  beforeEach(() => {
    process.env["ADMIN_PASSCODE"] = "secret-code";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env["ADMIN_PASSCODE"];
    else process.env["ADMIN_PASSCODE"] = prev;
  });

  it("accepts the correct passcode and rejects a wrong one", () => {
    expect(checkAdminAuth(req("secret-code", "1.1.1.1"))).toBe("ok");
    expect(checkAdminAuth(req("nope", "2.2.2.2"))).toBe("unauthorized");
  });

  it("rate limits after too many failures from one IP", () => {
    const ip = "3.3.3.3";
    for (let i = 0; i < 5; i++) expect(checkAdminAuth(req("wrong", ip))).toBe("unauthorized");
    expect(checkAdminAuth(req("wrong", ip))).toBe("rate_limited");
    // 正しいコードでもレート枠を使い切っていれば弾かれる(総当たり対策)。
    expect(checkAdminAuth(req("secret-code", ip))).toBe("rate_limited");
  });

  it("validates unlock codes against the admin passcode", () => {
    expect(isValidUnlockCode("secret-code")).toBe(true);
    expect(isValidUnlockCode("wrong")).toBe(false);
    expect(isValidUnlockCode(undefined)).toBe(false);
    expect(isValidUnlockCode("")).toBe(false);
  });
});
