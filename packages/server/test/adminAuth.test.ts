import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import { checkAdminAccess, checkAdminAuth, isValidUnlockCode } from "../src/adminAuth.js";

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

  it("管理者画面はパスコードだけで入れる(ログインしていなくてよい。オーナー指示)", async () => {
    expect(await checkAdminAccess(req("secret-code", "9.9.9.9"))).toEqual({ status: "ok" });
    expect(await checkAdminAccess(req("nope", "9.9.9.8"))).toEqual({ status: "unauthorized" });
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

describe("管理者のアカウント", () => {
  it("一覧に無いメールアドレス・未ログインは管理者ではない(組み込みの一覧はハッシュだけを持つ)", async () => {
    const { isAdminIdentity } = await import("../src/adminAuth.js");
    expect(isAdminIdentity("someone@example.com", null)).toBe(false);
    expect(isAdminIdentity(null, null)).toBe(false);
  });

  it("env ADMIN_EMAILS / ADMIN_USER_IDS で足せる", async () => {
    const { isAdminIdentity } = await import("../src/adminAuth.js");
    process.env["ADMIN_EMAILS"] = "ops@example.com, other@example.com";
    process.env["ADMIN_USER_IDS"] = "user-123";
    try {
      expect(isAdminIdentity("  OPS@example.com ", null)).toBe(true); // 大文字・空白は無視
      expect(isAdminIdentity(null, "user-123")).toBe(true);
      expect(isAdminIdentity("x@example.com", "user-999")).toBe(false);
    } finally {
      delete process.env["ADMIN_EMAILS"];
      delete process.env["ADMIN_USER_IDS"];
    }
  });
});
