import { afterEach, describe, expect, it } from "vitest";
import {
  EMBED_TOKEN_MESSAGE,
  allowedParentOrigins,
  isAllowedParentOrigin,
  parseEmbedTokenMessage,
} from "../src/lib/embedSession";

/**
 * 埋め込みモードのトークン受け渡しの単体テスト。
 *
 * ここは「親アプリから受け取ったトークンをそのままサーバーへの認証に使う」経路なので、
 * 受け取り口が緩いと第三者のページに埋め込まれてトークンを注入されうる。
 * 次の2点を固定する:
 *  - 許可リストに無いオリジンからは絶対に受け取らないこと
 *  - 設定漏れ(未設定)が「誰からでも受け取る」に化けないこと
 */

const ENV_KEY = "NEXT_PUBLIC_EMBED_PARENT_ORIGINS";

function setAllowed(value: string | undefined): void {
  if (value === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = value;
}

afterEach(() => setAllowed(undefined));

describe("親オリジンの許可リスト", () => {
  it("parses a comma separated list and ignores blanks", () => {
    setAllowed(" https://rrpoker.example , , https://www.rrpoker.example ");
    expect(allowedParentOrigins()).toEqual(["https://rrpoker.example", "https://www.rrpoker.example"]);
  });

  it("accepts only origins on the list, matched exactly", () => {
    setAllowed("https://rrpoker.example");
    expect(isAllowedParentOrigin("https://rrpoker.example")).toBe(true);

    // 似ているだけのオリジンは全て拒否する。
    expect(isAllowedParentOrigin("https://rrpoker.example.evil.test")).toBe(false);
    expect(isAllowedParentOrigin("https://evil.test")).toBe(false);
    expect(isAllowedParentOrigin("http://rrpoker.example")).toBe(false);
    expect(isAllowedParentOrigin("https://rrpoker.example:8443")).toBe(false);
    expect(isAllowedParentOrigin("https://sub.rrpoker.example")).toBe(false);
    expect(isAllowedParentOrigin("null")).toBe(false);
    expect(isAllowedParentOrigin("")).toBe(false);
  });

  it("accepts nothing when the allowlist is unset (a missing setting must not open it up)", () => {
    setAllowed(undefined);
    expect(allowedParentOrigins()).toEqual([]);
    expect(isAllowedParentOrigin("https://rrpoker.example")).toBe(false);
    expect(isAllowedParentOrigin("*")).toBe(false);
  });

  it("accepts nothing when the allowlist is empty or only separators", () => {
    setAllowed("");
    expect(isAllowedParentOrigin("https://rrpoker.example")).toBe(false);
    setAllowed(" , , ");
    expect(isAllowedParentOrigin("https://rrpoker.example")).toBe(false);
  });
});

describe("受け取るメッセージの形", () => {
  it("accepts a well formed token message", () => {
    expect(parseEmbedTokenMessage({ type: EMBED_TOKEN_MESSAGE, token: "abc" })).toEqual({
      type: EMBED_TOKEN_MESSAGE,
      token: "abc",
    });
  });

  it("rejects anything else", () => {
    // 型が違う・空文字・別のメッセージ・そもそもオブジェクトでない、を全て弾く。
    expect(parseEmbedTokenMessage({ type: EMBED_TOKEN_MESSAGE, token: "" })).toBeNull();
    expect(parseEmbedTokenMessage({ type: EMBED_TOKEN_MESSAGE, token: 123 })).toBeNull();
    expect(parseEmbedTokenMessage({ type: EMBED_TOKEN_MESSAGE })).toBeNull();
    expect(parseEmbedTokenMessage({ type: "other", token: "abc" })).toBeNull();
    expect(parseEmbedTokenMessage("pokerart:token")).toBeNull();
    expect(parseEmbedTokenMessage(null)).toBeNull();
    expect(parseEmbedTokenMessage(undefined)).toBeNull();
    expect(parseEmbedTokenMessage(["pokerart:token", "abc"])).toBeNull();
  });
});
