import { describe, expect, it } from "vitest";
import { parseFeedbackImages, sniffImageMime } from "../src/feedbackApi.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]);

describe("ご意見フォームの写真の検証", () => {
  it("中身の先頭のバイトで種類を決める(申告された mime は使わない)", () => {
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(PNG)).toBe("image/png");
    expect(sniffImageMime(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });

  it("base64 / data URL を受け取り、枚数・大きさ・種類を確かめる", () => {
    const ok = parseFeedbackImages([
      { mime: "image/png", data: `data:image/jpeg;base64,${JPEG.toString("base64")}` },
      { data: PNG.toString("base64") },
    ]);
    expect(Array.isArray(ok) && ok.map((i) => i.mime)).toEqual(["image/jpeg", "image/png"]);
    expect(parseFeedbackImages(undefined)).toEqual([]);
    expect(parseFeedbackImages([{ data: JPEG.toString("base64") }, { data: "x" }, { data: "y" }, { data: "z" }])).toBe("too many images");
    expect(parseFeedbackImages([{ data: Buffer.from("hello").toString("base64") }])).toBe("unsupported image");
    expect(parseFeedbackImages([{ data: Buffer.alloc(1_400_000, 0xff).toString("base64") }])).toBe("image too large");
  });
});
