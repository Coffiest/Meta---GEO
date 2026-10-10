import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import {
  createPartner,
  generatePartnerCode,
  isPartnerCodeTaken,
  isValidPartnerCode,
  listPartners,
  normalizePartnerCode,
  setPartnerActive,
} from "../src/partners.js";

/**
 * インフルエンサー(ローンチパートナー)のコードの台帳。実DB(Postgres)が必要。
 *
 * ここで固定している仕様:
 *  - コードは大文字英数字 4〜20 文字(Stripe のプロモーションコードに使える文字だけ)。表記の揺れは吸収する
 *  - 自動で作るコードは読み間違えやすい文字(I/O/0/1)を含まない
 *  - 明細ページの鍵はパートナーごとに別で、推測されない長さ
 */

const RUN = Date.now().toString(36).toUpperCase();
const created: string[] = [];

afterAll(async () => {
  await prisma.partner.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe("partner codes", () => {
  it("normalizes and validates codes", () => {
    expect(normalizePartnerCode("hikaru-30 ")).toBe("HIKARU30");
    expect(isValidPartnerCode("HIKARU30")).toBe(true);
    expect(isValidPartnerCode("AB1")).toBe(false);
    expect(isValidPartnerCode("A".repeat(21))).toBe(false);
    expect(isValidPartnerCode("HIKARU-30")).toBe(false);
  });

  it("generates readable codes", () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePartnerCode();
      expect(code).toMatch(/^ART[A-HJ-NP-Z2-9]{5}$/);
      expect(isValidPartnerCode(code)).toBe(true);
    }
  });

  it("creates, lists and deactivates partners", async () => {
    const code = `T${RUN}`.slice(0, 20);
    const a = await createPartner({
      name: "テスト",
      contact: "@test",
      note: null,
      code,
      stripePromotionCodeId: `promo_${RUN}_a`,
      userId: null,
    });
    created.push(a.id);
    const b = await createPartner({
      name: "テスト2",
      contact: null,
      note: null,
      code: `${code.slice(0, 18)}B`,
      stripePromotionCodeId: `promo_${RUN}_b`,
      userId: null,
    });
    created.push(b.id);

    expect(a.active).toBe(true);
    expect(a.statementToken.length).toBeGreaterThanOrEqual(32);
    expect(a.statementToken).not.toBe(b.statementToken);
    expect(await isPartnerCodeTaken(code)).toBe(true);

    await setPartnerActive(a.id, false);
    const rows = await listPartners();
    expect(rows.find((r) => r.id === a.id)?.active).toBe(false);
    expect(rows.find((r) => r.id === b.id)?.active).toBe(true);
  });
});
