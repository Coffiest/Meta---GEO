import { describe, expect, it } from "vitest";
import { readTokenIssuer } from "../src/tokenCache.js";
import {
  FIREBASE_AUTH_ID_PREFIX,
  firebaseUidFromAuthId,
  isFirebaseIssuer,
  verifyFirebaseIdToken,
} from "../src/firebaseAuth.js";

/**
 * RRPoker(Firebase)アカウント受け入れの単体テスト。
 *
 * ここで固定したいのは「振り分け」と「名前空間の分離」:
 *  - どちらの発行元のトークンかを iss で正しく見分けること
 *  - Firebase由来のユーザーIDが、Supabase由来のIDと絶対に衝突しないこと
 *  - 資格情報が無い環境では、Firebaseトークンが通らないこと(黙って認証が甘くならない)
 */

/** テスト用のJWT風トークン(署名は使わないので中身だけ本物の形にする)。 */
function makeToken(payload: Record<string, unknown>): string {
  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

const FIREBASE_TOKEN = makeToken({
  iss: "https://securetoken.google.com/rrpoker-app",
  aud: "rrpoker-app",
  sub: "abc123",
  exp: Math.floor(Date.now() / 1000) + 3600,
});
const SUPABASE_TOKEN = makeToken({
  iss: "https://xyzproject.supabase.co/auth/v1",
  sub: "11111111-2222-3333-4444-555555555555",
  exp: Math.floor(Date.now() / 1000) + 3600,
});

describe("トークンの発行元の振り分け", () => {
  it("reads the issuer out of both kinds of token", () => {
    expect(readTokenIssuer(FIREBASE_TOKEN)).toBe("https://securetoken.google.com/rrpoker-app");
    expect(readTokenIssuer(SUPABASE_TOKEN)).toBe("https://xyzproject.supabase.co/auth/v1");
    expect(readTokenIssuer("not-a-jwt")).toBeNull();
    expect(readTokenIssuer("")).toBeNull();
  });

  it("routes Firebase tokens to Firebase and everything else to Supabase", () => {
    expect(isFirebaseIssuer(readTokenIssuer(FIREBASE_TOKEN))).toBe(true);
    expect(isFirebaseIssuer(readTokenIssuer(SUPABASE_TOKEN))).toBe(false);
    // issが読めないトークンはSupabase側へ回る(そこで弾かれる)。
    expect(isFirebaseIssuer(readTokenIssuer("garbage"))).toBe(false);
    expect(isFirebaseIssuer(null)).toBe(false);
  });

  it("never mistakes a lookalike issuer for Firebase", () => {
    // ホスト名を偽装した iss を Firebase と誤認しないこと。
    expect(isFirebaseIssuer("https://securetoken.google.com.evil.example/x")).toBe(false);
    expect(isFirebaseIssuer("http://securetoken.google.com/rrpoker-app")).toBe(false);
    expect(isFirebaseIssuer("https://evil.example/https://securetoken.google.com/")).toBe(false);
  });
});

describe("authIdの名前空間", () => {
  it("keeps Firebase ids in their own namespace", () => {
    expect(FIREBASE_AUTH_ID_PREFIX).toBe("firebase:");
    expect(firebaseUidFromAuthId("firebase:abc123")).toBe("abc123");
    // SupabaseのUUIDは接頭辞を持たないので、Firebase由来とは絶対に取り違えない。
    expect(firebaseUidFromAuthId("11111111-2222-3333-4444-555555555555")).toBeNull();
    expect(firebaseUidFromAuthId("")).toBeNull();
  });
});

describe("資格情報が無い環境", () => {
  it("rejects Firebase tokens instead of silently letting them through", async () => {
    // このテスト環境には FIREBASE_* の資格情報が無い。
    // 認証が甘くなるのではなく、必ず null(未認証)になることを固定する。
    expect(await verifyFirebaseIdToken(FIREBASE_TOKEN)).toBeNull();
    expect(await verifyFirebaseIdToken("garbage")).toBeNull();
  });
});
