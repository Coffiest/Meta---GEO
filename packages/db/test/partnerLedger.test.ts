import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { createPartner } from "../src/partners.js";
import {
  PARTNER_PROGRAM_DEADLINE,
  markPartnerPaid,
  monthKeyJst,
  partnerBalances,
  partnerLedgerRows,
  recordPartnerPayment,
  recordPartnerReferral,
  recordPartnerReversal,
  startOfMonthJst,
} from "../src/partnerLedger.js";

/**
 * インフルエンサーへの報酬の台帳。実DB(Postgres)が必要。
 *
 * ここで固定している仕様(docs/HANDOFF_influencer_partner.md。オーナー承認済み):
 *  - 報酬は入金額 × 率(円未満切り捨て)。最初の3回分は 80%、4回目以降は 20%(解約までずっと)。¥0 の請求は数えない
 *  - 同じ請求書を2回数えない(Webhook の再送)
 *  - 本人の加入・期限後の加入は記録するが報酬 0(理由付き)
 *  - 返金はマイナスの行。全額返金で報酬がちょうど 0 に戻る
 *  - 月末締め(日本時間)。締めた月の未払いが ¥3,000 未満なら払わない
 */

const RUN = Date.now().toString(36).toUpperCase();
const partnerIds: string[] = [];

async function makePartner(tag: string): Promise<string> {
  const p = await createPartner({
    name: `ledger-${tag}`,
    contact: null,
    note: null,
    code: `L${RUN}${tag}`.slice(0, 20),
    stripePromotionCodeId: `promo_${RUN}_${tag}`,
    userId: null,
  });
  partnerIds.push(p.id);
  return p.id;
}

afterAll(async () => {
  await prisma.partnerLedger.deleteMany({ where: { partnerId: { in: partnerIds } } });
  await prisma.partnerPayout.deleteMany({ where: { partnerId: { in: partnerIds } } });
  await prisma.partnerReferral.deleteMany({ where: { partnerId: { in: partnerIds } } });
  await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
  await prisma.$disconnect();
});

const OCT = new Date("2026-10-15T03:00:00Z");

describe("JST の月", () => {
  it("月初は日本時間で切る", () => {
    expect(startOfMonthJst(new Date("2026-10-31T16:00:00Z")).toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(monthKeyJst(new Date("2026-10-31T16:00:00Z"))).toBe("2026-11");
    expect(monthKeyJst(new Date("2026-10-31T14:59:00Z"))).toBe("2026-10");
  });
});

describe("partner ledger", () => {
  it("最初の3回分は80%、4回目以降は20%", async () => {
    const partnerId = await makePartner("A");
    const sub = `sub_${RUN}_A`;
    await recordPartnerReferral({ partnerId, stripeSubscriptionId: sub, userId: null, selfReferral: false });
    await recordPartnerReferral({ partnerId, stripeSubscriptionId: sub, userId: null, selfReferral: false });

    const pay = (n: string, amount: number) =>
      recordPartnerPayment({
        stripeSubscriptionId: sub,
        stripeInvoiceId: `in_${RUN}_A${n}`,
        stripeChargeId: `ch_${RUN}_A${n}`,
        amount,
        plan: "gold",
        occurredAt: OCT,
      });
    expect(await pay("0", 0)).toBe("zero");
    expect(await pay("1", 966)).toBe("recorded");
    expect(await pay("1", 966)).toBe("duplicate");
    expect(await pay("2", 1380)).toBe("recorded");
    expect(await pay("3", 1380)).toBe("recorded");
    expect(await pay("4", 1380)).toBe("recorded");
    expect(await pay("5", 1380)).toBe("recorded");

    const rows = await partnerLedgerRows(partnerId);
    expect(rows.map((r) => [r.paymentIndex, r.commission]).sort()).toEqual([
      [1, 772],
      [2, 1104],
      [3, 1104],
      [4, 276],
      [5, 276],
    ]);
  });

  it("コードを使っていない契約は記録しない", async () => {
    expect(
      await recordPartnerPayment({
        stripeSubscriptionId: `sub_${RUN}_none`,
        stripeInvoiceId: `in_${RUN}_none`,
        stripeChargeId: null,
        amount: 1380,
        plan: "gold",
        occurredAt: OCT,
      }),
    ).toBe("not_referred");
  });

  it("本人の加入は報酬 0(理由付き)", async () => {
    const partnerId = await makePartner("S");
    const sub = `sub_${RUN}_S`;
    await recordPartnerReferral({ partnerId, stripeSubscriptionId: sub, userId: null, selfReferral: true });
    await recordPartnerPayment({
      stripeSubscriptionId: sub,
      stripeInvoiceId: `in_${RUN}_S1`,
      stripeChargeId: null,
      amount: 966,
      plan: "gold",
      occurredAt: OCT,
    });
    const [row] = await partnerLedgerRows(partnerId);
    expect(row?.commission).toBe(0);
    expect(row?.voidReason).toBe("self");
  });

  it("期限後に始まった契約は報酬 0", async () => {
    const partnerId = await makePartner("E");
    const sub = `sub_${RUN}_E`;
    await recordPartnerReferral({ partnerId, stripeSubscriptionId: sub, userId: null, selfReferral: false });
    await prisma.partnerReferral.update({
      where: { stripeSubscriptionId: sub },
      data: { createdAt: new Date(PARTNER_PROGRAM_DEADLINE.getTime() + 1000) },
    });
    await recordPartnerPayment({
      stripeSubscriptionId: sub,
      stripeInvoiceId: `in_${RUN}_E1`,
      stripeChargeId: null,
      amount: 966,
      plan: "gold",
      occurredAt: OCT,
    });
    const [row] = await partnerLedgerRows(partnerId);
    expect(row?.voidReason).toBe("expired");
    expect(row?.commission).toBe(0);
  });

  it("返金はマイナスの行。全額返金で報酬が 0 に戻る", async () => {
    const partnerId = await makePartner("R");
    const sub = `sub_${RUN}_R`;
    const charge = `ch_${RUN}_R1`;
    await recordPartnerReferral({ partnerId, stripeSubscriptionId: sub, userId: null, selfReferral: false });
    await recordPartnerPayment({
      stripeSubscriptionId: sub,
      stripeInvoiceId: `in_${RUN}_R1`,
      stripeChargeId: charge,
      amount: 966,
      plan: "gold",
      occurredAt: OCT,
    });
    expect(await recordPartnerReversal({ kind: "refund", sourceId: `re_${RUN}_1`, stripeChargeId: charge, amount: 500, occurredAt: OCT })).toBe(true);
    expect(await recordPartnerReversal({ kind: "refund", sourceId: `re_${RUN}_1`, stripeChargeId: charge, amount: 500, occurredAt: OCT })).toBe(false);
    expect(await recordPartnerReversal({ kind: "refund", sourceId: `re_${RUN}_2`, stripeChargeId: charge, amount: 466, occurredAt: OCT })).toBe(true);
    const rows = await partnerLedgerRows(partnerId);
    expect(rows.reduce((s, r) => s + r.commission, 0)).toBe(0);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(0);
    expect(await recordPartnerReversal({ kind: "refund", sourceId: `re_${RUN}_x`, stripeChargeId: "ch_unknown", amount: 1, occurredAt: OCT })).toBe(false);
  });

  it("月末締め: 締めた月の分だけ、¥3,000 以上で払う", async () => {
    const partnerId = await makePartner("P");
    for (let i = 0; i < 4; i++) {
      const sub = `sub_${RUN}_P${i}`;
      await recordPartnerReferral({ partnerId, stripeSubscriptionId: sub, userId: null, selfReferral: false });
      await recordPartnerPayment({
        stripeSubscriptionId: sub,
        stripeInvoiceId: `in_${RUN}_P${i}`,
        stripeChargeId: null,
        amount: 1380,
        plan: "gold",
        // 3件は10月、1件は11月
        occurredAt: i < 3 ? OCT : new Date("2026-11-02T03:00:00Z"),
      });
    }
    const inOct = new Date("2026-10-20T03:00:00Z");
    expect(await markPartnerPaid(partnerId, inOct)).toEqual({ ok: false, reason: "below_minimum", amount: 0 });

    const inNov = new Date("2026-11-10T03:00:00Z");
    const before = (await partnerBalances(inNov)).find((b) => b.partnerId === partnerId);
    expect(before).toMatchObject({ referrals: 4, payable: 3312, accruing: 1104, paidTotal: 0 });

    const res = await markPartnerPaid(partnerId, inNov);
    expect(res).toMatchObject({ ok: true, amount: 3312 });
    const after = (await partnerBalances(inNov)).find((b) => b.partnerId === partnerId);
    expect(after).toMatchObject({ payable: 0, accruing: 1104, paidTotal: 3312 });
  });
});
