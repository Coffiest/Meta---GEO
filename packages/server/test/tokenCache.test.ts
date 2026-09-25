import { describe, expect, it } from "vitest";
import { createTokenVerifier, readTokenExpiryMs, type VerifiedUser } from "../src/tokenCache.js";

/**
 * トークン検証キャッシュの単体テスト。
 * ここで固定したいのは「往復を減らす」ことと、「減らしたせいで期限切れトークンが通らない」ことの両方。
 */

/** テスト用のJWT風トークン(署名は検証しないので中身だけ本物の形にする)。 */
function makeToken(payload: Record<string, unknown>): string {
  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

const USER: VerifiedUser = { authId: "auth-1", email: "a@example.com" };

describe("readTokenExpiryMs", () => {
  it("reads exp from a JWT payload and ignores anything unreadable", () => {
    expect(readTokenExpiryMs(makeToken({ exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
    expect(readTokenExpiryMs(makeToken({ sub: "no-exp" }))).toBeNull();
    expect(readTokenExpiryMs("not-a-jwt")).toBeNull();
    expect(readTokenExpiryMs("")).toBeNull();
  });
});

describe("createTokenVerifier", () => {
  it("verifies once and serves the rest from cache", async () => {
    let remoteCalls = 0;
    const verifier = createTokenVerifier(async () => {
      remoteCalls += 1;
      return USER;
    });
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 });

    expect(await verifier.verify(token)).toEqual(USER);
    expect(await verifier.verify(token)).toEqual(USER);
    expect(await verifier.verify(token)).toEqual(USER);

    expect(remoteCalls).toBe(1);
    expect(verifier.stats()).toMatchObject({ calls: 3, cacheHits: 2, remoteCalls: 1 });
  });

  it("collapses concurrent verifications of the same token into one round trip", async () => {
    let remoteCalls = 0;
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const verifier = createTokenVerifier(async () => {
      remoteCalls += 1;
      await gate;
      return USER;
    });
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 });

    // ホーム画面が同時に十数本のAPIを叩く状況を再現する。
    const pending = Array.from({ length: 12 }, () => verifier.verify(token));
    release!();
    const results = await Promise.all(pending);

    expect(results.every((r) => r?.authId === USER.authId)).toBe(true);
    expect(remoteCalls).toBe(1);
    expect(verifier.stats().remoteCalls).toBe(1);
  });

  it("keeps different tokens separate", async () => {
    const seen: string[] = [];
    const verifier = createTokenVerifier(async (token) => {
      seen.push(token);
      return { authId: `auth-${seen.length}`, email: null };
    });
    const exp = Math.floor(Date.now() / 1000) + 3600;

    const a = await verifier.verify(makeToken({ exp, sub: "a" }));
    const b = await verifier.verify(makeToken({ exp, sub: "b" }));

    expect(a?.authId).toBe("auth-1");
    expect(b?.authId).toBe("auth-2");
    expect(seen).toHaveLength(2);
  });

  it("never serves a cached result past the token's own expiry", async () => {
    let remoteCalls = 0;
    let clock = Date.now();
    const verifier = createTokenVerifier(
      async () => {
        remoteCalls += 1;
        return USER;
      },
      () => clock,
    );
    // 有効期限は10秒後。キャッシュのTTL(60秒)より短いので、期限側が勝たなければならない。
    const token = makeToken({ exp: Math.floor(clock / 1000) + 10 });

    expect(await verifier.verify(token)).toEqual(USER);
    clock += 5_000;
    expect(await verifier.verify(token)).toEqual(USER);
    expect(remoteCalls).toBe(1);

    // 期限を過ぎたらキャッシュを使わず、必ず検証しに行く。
    clock += 6_000;
    expect(await verifier.verify(token)).toEqual(USER);
    expect(remoteCalls).toBe(2);
  });

  it("re-verifies after the cache TTL for long-lived tokens", async () => {
    let remoteCalls = 0;
    let clock = Date.now();
    const verifier = createTokenVerifier(
      async () => {
        remoteCalls += 1;
        return USER;
      },
      () => clock,
    );
    const token = makeToken({ exp: Math.floor(clock / 1000) + 86_400 });

    await verifier.verify(token);
    clock += 59_000;
    await verifier.verify(token);
    expect(remoteCalls).toBe(1);

    clock += 2_000; // TTL(60秒)超え
    await verifier.verify(token);
    expect(remoteCalls).toBe(2);
  });

  it("caches rejections only briefly so a bad token cannot hammer the auth API", async () => {
    let remoteCalls = 0;
    let clock = Date.now();
    const verifier = createTokenVerifier(
      async () => {
        remoteCalls += 1;
        return null;
      },
      () => clock,
    );

    expect(await verifier.verify("bogus")).toBeNull();
    expect(await verifier.verify("bogus")).toBeNull();
    expect(remoteCalls).toBe(1);

    clock += 6_000; // 無効トークンのTTL(5秒)超え
    expect(await verifier.verify("bogus")).toBeNull();
    expect(remoteCalls).toBe(2);
  });

  it("drops a token immediately when invalidated", async () => {
    let remoteCalls = 0;
    const verifier = createTokenVerifier(async () => {
      remoteCalls += 1;
      return USER;
    });
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 });

    await verifier.verify(token);
    verifier.invalidate(token);
    await verifier.verify(token);
    expect(remoteCalls).toBe(2);
  });

  it("does not cache a failed round trip (a network blip must not stick)", async () => {
    let attempt = 0;
    const verifier = createTokenVerifier(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("network down");
      return USER;
    });
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 });

    await expect(verifier.verify(token)).rejects.toThrow("network down");
    expect(await verifier.verify(token)).toEqual(USER);
  });

  it("treats a missing token as unauthenticated without counting a call", async () => {
    const verifier = createTokenVerifier(async () => USER);
    expect(await verifier.verify(undefined)).toBeNull();
    expect(await verifier.verify("")).toBeNull();
    expect(verifier.stats().calls).toBe(0);
  });
});
