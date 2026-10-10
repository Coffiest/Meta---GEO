"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

type RowStatus = "accruing" | "payable" | "paid" | "void_self" | "void_expired";

interface Statement {
  partner: { name: string; code: string; active: boolean };
  terms: { ratePercent: number; paymentsCovered: number; discountPercent: number; minPayout: number; deadline: string };
  balance: { referrals: number; accruing: number; payable: number; paidTotal: number };
  rows: {
    occurredAt: string;
    month: string;
    kind: "payment" | "refund" | "dispute";
    member: string;
    invoiceTail: string | null;
    paymentIndex: number;
    plan: string | null;
    amount: number;
    commission: number;
    status: RowStatus;
  }[];
  payouts: { amount: number; paidAt: string; closedMonth: string }[];
}

const KIND_LABEL: Record<Statement["rows"][number]["kind"], string> = {
  payment: "入金",
  refund: "返金",
  dispute: "チャージバック",
};

const STATUS_LABEL: Record<RowStatus, string> = {
  accruing: "今月分",
  payable: "未払い",
  paid: "支払済",
  void_self: "対象外(ご本人の加入)",
  void_expired: "対象外(期限後の加入)",
};

const PLAN_LABEL: Record<string, string> = { silver: "シルバー", gold: "ゴールド", platinum: "プラチナ" };

function yen(n: number): string {
  return `${n < 0 ? "-" : ""}¥${Math.abs(n).toLocaleString()}`;
}

function jstDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** "2026-08" → "2026年8月" */
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${y}年${Number(m)}月`;
}

/**
 * インフルエンサー本人の明細(秘密の URL で開く。ログイン不要)。報酬の根拠を1行ずつ出し、本人が検算できるようにする。
 * 仕様は docs/HANDOFF_influencer_partner.md。
 */
export default function PartnerStatementPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [data, setData] = useState<Statement | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notFound" | "error">("loading");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetch(`${SERVER_URL}/api/partner/statement?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setState("notFound");
        if (!res.ok) return setState("error");
        setData((await res.json()) as Statement);
        setState("ok");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-md px-4 pb-16">
        <header className="flex items-center justify-between pb-6 pt-[calc(env(safe-area-inset-top)+16px)]">
          <div className="text-[11px] font-semibold tracking-[0.25em] text-accent">POKER ART</div>
        </header>

        {state === "loading" && <p className="text-[13px] text-fg-3">読み込み中…</p>}
        {state === "notFound" && <p className="text-[13px] text-fg-2">この URL の明細は見つかりませんでした。URL をもう一度ご確認ください。</p>}
        {state === "error" && <p className="text-[13px] text-fg-2">明細を読み込めませんでした。時間をおいて開き直してください。</p>}

        {data && (
          <>
            <h1 className="text-xl font-bold text-fg">{data.partner.name} さんの明細</h1>
            <p className="mt-1 text-[12px] text-fg-3">
              コード <span className="font-black tracking-wider text-fg">{data.partner.code}</span>
              {!data.partner.active && " ・ 停止中"}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                { label: "加入した人", value: `${data.balance.referrals}人` },
                { label: "今月分(来月末にお支払い)", value: yen(data.balance.accruing) },
                { label: "未払い(締め済み)", value: yen(data.balance.payable) },
                { label: "お支払い済み", value: yen(data.balance.paidTotal) },
              ].map((m) => (
                <div key={m.label} className="rounded-xl bg-surface px-3 py-2.5 shadow-e1">
                  <p className="text-[10px] font-bold text-fg-3">{m.label}</p>
                  <p className="mt-0.5 text-[18px] font-black tabular-nums text-fg">{m.value}</p>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-fg-3">
              報酬は、このコードで加入した方の最初の{data.terms.paymentsCovered}回分の入金額(割引後・税込)の
              {data.terms.ratePercent}%です。月末締め・翌月末払いで、未払いが ¥{data.terms.minPayout.toLocaleString()}
              に届かない月は翌月に繰り越します。返金・チャージバックがあった分は差し引きます。対象は{" "}
              {jstDate(new Date(new Date(data.terms.deadline).getTime() - 1).toISOString())} までに加入した方です。
            </p>

            <h2 className="mt-6 text-[13px] font-black text-fg">明細</h2>
            {data.rows.length === 0 ? (
              <p className="mt-2 text-[12px] text-fg-3">まだ入金はありません。</p>
            ) : (
              <div className="mt-2">
                {data.rows.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 border-t border-line py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-bold text-fg">
                        {KIND_LABEL[r.kind]} ・ 会員 {r.member} ・ {r.paymentIndex}回目
                      </p>
                      <p className="mt-0.5 text-[11px] text-fg-3">
                        {jstDate(r.occurredAt)}
                        {r.plan && <span className="whitespace-nowrap">{` ・ ${PLAN_LABEL[r.plan] ?? r.plan}`}</span>}
                        {r.invoiceTail && <span className="whitespace-nowrap">{` ・ 請求書 …${r.invoiceTail}`}</span>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-black tabular-nums text-fg">{yen(r.commission)}</p>
                      <p className="text-[10.5px] tabular-nums text-fg-3">入金 {yen(r.amount)}</p>
                      <p className={`text-[10.5px] font-bold ${r.status === "paid" ? "text-accent" : "text-fg-3"}`}>
                        {STATUS_LABEL[r.status]}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {data.payouts.length > 0 && (
              <>
                <h2 className="mt-6 text-[13px] font-black text-fg">お支払い</h2>
                <div className="mt-2">
                  {data.payouts.map((p, i) => (
                    <div key={i} className="flex items-center justify-between border-t border-line py-2.5">
                      <p className="text-[12px] text-fg-2">
                        {jstDate(p.paidAt)} ・ {monthLabel(p.closedMonth)}分まで
                      </p>
                      <p className="text-[13px] font-black tabular-nums text-fg">{yen(p.amount)}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
