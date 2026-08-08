import { describe, expect, it } from "vitest";
import { clampLimit } from "../src/httpBody.js";

describe("clampLimit", () => {
  it("falls back when the value is missing or not a number", () => {
    expect(clampLimit(null, 20)).toBe(20);
    expect(clampLimit("abc", 20)).toBe(20);
    expect(clampLimit("", 20)).toBe(20);
  });

  it("clamps into the allowed range", () => {
    expect(clampLimit("999999999", 20, 1, 200)).toBe(200);
    expect(clampLimit("-1", 20, 1, 200)).toBe(1);
    expect(clampLimit("50", 20, 1, 200)).toBe(50);
  });

  it("truncates fractional values", () => {
    expect(clampLimit("12.9", 20, 1, 200)).toBe(12);
  });
});
