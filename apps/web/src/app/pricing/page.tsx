"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import {
  changePlan,
  DEFAULT_PRICES,
  openBillingPortal,
  PLAN_LABEL,
  startCheckout,
  SubscriptionUnavailableError,
  useSubscriptionStatus,
  type PlanId,
} from "@/lib/subscription";
import { CouponWallet } from "@/components/CouponWallet";

/** プランごとにできること。soon = まだ提供していない(準備中と表示する)。 */
const PLAN_FEATURES: Record<PlanId, { text: string; soon?: boolean }[]> = {
  silver: [
    { text: "棋譜解析を待ち時間なしで無制限に(解説付き)" },
    { text: "広告なし", soon: true },
  ],
  gold: [
    { text: "シルバーの内容すべて" },
    { text: "GEOデータベース(インマネ10回でプリフロップ、20回でポストフロップ)" },
  ],
  platinum: [
    { text: "ゴールドの内容すべて" },
    { text: "GEOデータベースを条件なしですべて" },
    { text: "データ研究" },
    { text: "棋譜解析で相手がマックした手札を見る", soon: true },
  ],
};

const PLAN_ORDER: PlanId[] = ["silver", "gold", "platinum"];

import { ReportErrorButton } from "@/components/ReportErrorButton";
import { Icon, HeroIcon } from "@/components/Icon";
import { Loader } from "@/components/ui/Loader";

export default function PricingPage() {
  const { accessToken: accessTokenFromAuth } = useAuth();
  const accessToken = accessTokenFromAuth ?? undefined;
  const { status, reload } = useSubscriptionStatus(accessToken);
  const [submitting, setSubmitting] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  // App Store配布のiOSアプリ内かどうか(サーバーサイドレンダー時はfalse扱いのまま、
  // マウント後にUAを見て確定させる)。trueなら課金ボタン自体を出さずウェブへ誘導する。

  async function handleSubscribe(plan: PlanId) {
    if (!accessToken) {
      setError("ご登録にはログインが必要です。");
      return;
    }
    setSubmitting(plan);
    setError(null);
    try {
      if (status?.canChangePlan) {
        await changePlan(accessToken, plan);
        setSubmitting(null);
        await reload();
        return;
      }
      await startCheckout(accessToken, undefined, plan);
    } catch (e) {
      setSubmitting(null);
      if (e instanceof SubscriptionUnavailableError) {
        setError("決済は現在準備中です。まもなくご利用いただけます。");
      } else {
        setError("チェックアウトの開始に失敗しました。時間をおいて再度お試しください。");
      }
    }
  }

  async function handleManage() {
    if (!accessToken) return;
    try {
      await openBillingPortal(accessToken);
    } catch {
      setError("契約管理ページを開けませんでした。");
    }
  }

  const active = status?.active ?? false;
  // クーポンだけで使い放題になっている状態。Stripe契約が無いため契約管理は出さず、
  // 期限と「クーポンを足せばさらに延長できる」ことを伝える。
  const byCoupon = active && status?.status === "referral";
  const couponUntil =
    byCoupon && status?.currentPeriodEnd ? new Date(status.currentPeriodEnd).toLocaleDateString() : null;
  const currentPlan = status?.plan ?? null;
  const canChange = status?.canChangePlan ?? false;
  const trialEligible = status?.trialEligible ?? false;
  const trialDays = status?.trialDays ?? 7;
  const prices = status?.prices ?? DEFAULT_PRICES;

  function buttonLabel(plan: PlanId): string {
    if (canChange && currentPlan) {
      return PLAN_ORDER.indexOf(plan) > PLAN_ORDER.indexOf(currentPlan) ? "このプランに上げる" : "このプランに下げる";
    }
    if (trialEligible) return `${trialDays}日間 無料で試す`;
    return byCoupon ? "期間終了後も続けて使う" : "このプランに登録";
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-md mx-auto px-4 pb-16">
        <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+16px)] pb-6">
          <div className="text-[11px] tracking-[0.25em] text-accent font-semibold">POKER ART</div>
          <Link href="/" className="text-[12px] text-n-9 hover:text-fg">
            戻る
          </Link>
        </header>

        {/* 見出しの主張を1段上げるための大きめアイコン。ここだけ Hugeicons(面のある絵柄)を使う。 */}
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-n-4 text-accent">
          <HeroIcon name="graph-up" size={30} />
        </span>
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-accent">Plans</p>
        <h1 className="mt-1 text-[26px] font-black leading-tight tracking-tight text-fg">
          プランを選ぶ<span className="text-accent">.</span>
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-n-9">
          無料プランの棋譜解析は24時間に1回まで。月額のみ・いつでも解約できます。
        </p>
        {trialEligible && !active && (
          <p className="mt-3 rounded-xl bg-accent/10 px-3 py-2 text-[12px] font-bold text-accent">
            はじめての方は、どのプランでも{trialDays}日間無料で試せます(お1人様1回)。体験終了後は選んだプランの月額で自動更新されます。体験中に解約すれば料金はかかりません。
          </p>
        )}
        {byCoupon && (
          <p className="mt-3 text-[12px] leading-relaxed text-n-9">
            クーポンで無料期間中{couponUntil ? `(${couponUntil} まで)` : ""}。クーポンを追加すると期間が延びます。
          </p>
        )}

        <div className="mt-5 space-y-3">
          {PLAN_ORDER.map((plan) => {
            const current = active && !byCoupon && currentPlan === plan;
            const price = prices[plan];
            return (
              <div
                key={plan}
                className={`rounded-2xl p-5 ${current ? "border-2 border-accent bg-n-2 shadow-glow" : "border border-line bg-n-2"}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-[17px] font-black text-fg">
                    {PLAN_LABEL[plan]}
                    {plan === "gold" && !current && (
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-black text-accent ring-1 ring-inset ring-accent">
                        おすすめ
                      </span>
                    )}
                  </h2>
                  <p className="tracking-[-0.025em]">
                    <span className="text-[26px] font-black text-fg tabular-nums">¥{price.toLocaleString()}</span>
                    <span className="ml-1 text-[11px] font-bold text-fg-2">/ 月(税込)</span>
                  </p>
                </div>
                <ul className="mt-3 space-y-2">
                  {PLAN_FEATURES[plan].map((f) => (
                    <li key={f.text} className="flex items-start gap-2.5 text-[13px] font-medium text-n-10">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent">
                        <Icon name="check" className="h-3 w-3" />
                      </span>
                      <span>
                        {f.text}
                        {f.soon && <span className="ml-1.5 text-[10px] font-bold text-fg-2">準備中</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {current ? (
                  <div className="mt-4 flex items-center justify-center gap-1.5 rounded-full bg-accent/10 py-2.5 text-[13px] font-black text-accent">
                    <Icon name="check" className="h-4 w-4" />
                    加入中
                  </div>
                ) : (
                  <button
                    onClick={() => void handleSubscribe(plan)}
                    disabled={submitting != null || (active && !byCoupon && !canChange)}
                    className="mt-4 flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-accent text-[14px] font-black text-on-accent pressable transition disabled:opacity-60"
                  >
                    {submitting === plan ? <Loader size="sm" /> : buttonLabel(plan)}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {canChange && (
          <p className="mt-3 text-[11px] leading-relaxed text-fg-2">
            加入中にプランを変えると、差額は日割りでその場で請求(下げる場合は次回以降の請求から差し引き)されます。
          </p>
        )}
        {active && !byCoupon && (
          <button
            onClick={handleManage}
            className="mt-3 w-full rounded-full border border-line-strong py-3 text-[13px] font-bold text-fg pressable"
          >
            契約を管理する(解約・支払い方法)
          </button>
        )}
        {error && (
          <div className="mt-2 text-center">
            <p className="text-[11px] font-bold text-crimson-300">{error}</p>
            <ReportErrorButton scope="pricing" message={error} className="mt-1.5 justify-center" />
          </div>
        )}

        {/* 課金せずに使う手段。招待で貰ったクーポンをここでも確認・コピー・適用できる。 */}
        <div className="mt-4">
          <CouponWallet accessToken={accessToken} onRedeemed={() => void reload()} />
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-fg-2">
          決済はStripeを通じて安全に処理され、期限日に自動で更新(課金)されます。お支払いができなかった場合は自動的に解約となります。解約・支払い方法の変更はいつでも契約管理ページから行えます。
          本アプリはバーチャルチップ専用で、チップの購入・換金や実際の金銭を賭けることは一切できません。
        </p>
        <Link href="/legal/tokushoho" className="mt-2 inline-block text-[11px] text-fg-2 underline decoration-dotted underline-offset-2">
          特定商取引法に基づく表記
        </Link>
      </div>
    </div>
  );
}
