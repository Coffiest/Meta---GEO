import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidTransferCode, putTransfer, takeTransfer } from "../src/authTransfer.js";

const CODE = "a".repeat(32);
const TOKENS = { accessToken: "at-1", refreshToken: "rt-1" };

afterEach(() => {
  vi.useRealTimers();
  // 各テストの残骸を消費しておく(ストアはモジュールシングルトン)
  takeTransfer(CODE);
});

describe("authTransfer (シート→本体のセッション受け渡し)", () => {
  it("預けたトークンをコードで受け取れる", () => {
    expect(putTransfer(CODE, TOKENS)).toBe(true);
    expect(takeTransfer(CODE)).toEqual(TOKENS);
  });

  it("受け取りは一回限り(2回目はnull)", () => {
    putTransfer(CODE, TOKENS);
    expect(takeTransfer(CODE)).toEqual(TOKENS);
    expect(takeTransfer(CODE)).toBeNull();
  });

  it("存在しないコードはnull", () => {
    expect(takeTransfer("b".repeat(32))).toBeNull();
  });

  it("TTL(3分)を過ぎたら受け取れない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    putTransfer(CODE, TOKENS);
    vi.setSystemTime(new Date("2026-01-01T00:03:01Z"));
    expect(takeTransfer(CODE)).toBeNull();
  });

  it("不正な形式のコードは預け入れ・受け取りとも拒否", () => {
    expect(isValidTransferCode("short")).toBe(false);
    expect(isValidTransferCode("Z".repeat(32))).toBe(false);
    expect(putTransfer("short", TOKENS)).toBe(false);
    expect(takeTransfer("short")).toBeNull();
  });

  it("トークンが欠けている預け入れは拒否", () => {
    expect(putTransfer(CODE, { accessToken: "", refreshToken: "rt" })).toBe(false);
    expect(putTransfer(CODE, { accessToken: "at", refreshToken: "" })).toBe(false);
  });
});
