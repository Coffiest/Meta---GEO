import type { IncomingMessage, ServerResponse } from "node:http";
import {
  PARTNER_INTRO_PAYMENTS,
  PARTNER_INTRO_RATE,
  PARTNER_ONGOING_RATE,
  PARTNER_MIN_PAYOUT_JPY,
  PARTNER_PROGRAM_DEADLINE,
  getPartnerByStatementToken,
  monthKeyJst,
  partnerBalances,
  partnerLedgerRows,
  partnerPayouts,
  startOfMonthJst,
} from "@meta-geo/db";
import { PARTNER_DISCOUNT_PERCENT } from "./partnerStripe.js";

/**
 * インフルエンサー本人が見る明細(`/api/partner/statement?token=`)。ログイン不要で、本人専用の秘密の URL の鍵で開く。
 * 報酬の根拠(どの入金の何回目で、いくらの何%か)を1行ずつ見せ、こちらの計算を本人が検算できるようにする。
 * 加入者の名前は出さない(会員番号の頭だけ)。請求書番号は末尾だけ(Stripe の記録と突き合わせられる長さ)。
 */

export type StatementRowStatus = "accruing" | "payable" | "paid" | "void_self" | "void_expired";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export function statementRowStatus(
  row: { voidReason: string | null; payoutId: string | null; occurredAt: Date },
  now: Date,
): StatementRowStatus {
  if (row.voidReason === "self") return "void_self";
  if (row.voidReason === "expired") return "void_expired";
  if (row.payoutId) return "paid";
  return row.occurredAt < startOfMonthJst(now) ? "payable" : "accruing";
}

export async function handlePartnerApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/api/partner/statement" || req.method !== "GET") return false;

  const token = url.searchParams.get("token") ?? "";
  const partner = token.length >= 16 ? await getPartnerByStatementToken(token) : null;
  if (!partner) {
    sendJson(res, 404, { error: "not_found" });
    return true;
  }
  const now = new Date();
  const [rows, payouts, balances] = await Promise.all([
    partnerLedgerRows(partner.id),
    partnerPayouts(partner.id),
    partnerBalances(now, partner.id),
  ]);
  const balance = balances[0] ?? { referrals: 0, accruing: 0, payable: 0, paidTotal: 0 };
  sendJson(res, 200, {
    partner: { name: partner.name, code: partner.code, active: partner.active },
    terms: {
      introRatePercent: Math.round(PARTNER_INTRO_RATE * 100),
      introPayments: PARTNER_INTRO_PAYMENTS,
      ongoingRatePercent: Math.round(PARTNER_ONGOING_RATE * 100),
      discountPercent: PARTNER_DISCOUNT_PERCENT,
      minPayout: PARTNER_MIN_PAYOUT_JPY,
      deadline: PARTNER_PROGRAM_DEADLINE.toISOString(),
    },
    balance: {
      referrals: balance.referrals,
      accruing: balance.accruing,
      payable: balance.payable,
      paidTotal: balance.paidTotal,
    },
    rows: rows.map((r) => ({
      occurredAt: r.occurredAt.toISOString(),
      month: monthKeyJst(r.occurredAt),
      kind: r.kind,
      member: r.referralId.slice(0, 6).toUpperCase(),
      invoiceTail: r.stripeInvoiceId ? r.stripeInvoiceId.slice(-6) : null,
      paymentIndex: r.paymentIndex,
      plan: r.plan,
      amount: r.amount,
      commission: r.commission,
      status: statementRowStatus(r, now),
    })),
    payouts: payouts.map((p) => ({
      amount: p.amount,
      paidAt: p.paidAt.toISOString(),
      closedMonth: monthKeyJst(new Date(p.closedBefore.getTime() - 1)),
    })),
  });
  return true;
}
