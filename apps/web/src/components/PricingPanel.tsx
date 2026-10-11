"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FADE, SPRING_MOVE } from "@/lib/motion";
import { PlanToggle } from "@/components/PlanToggle";
import { useAuth } from "@/lib/useAuth";
import {
  changePlan,
  PortalUpdateDisabledError,
  DEFAULT_PRICES,
  openBillingPortal,
  PLAN_LABEL,
  startCheckout,
  PromoCodeError,
  SubscriptionUnavailableError,
  useSubscriptionStatus,
  type PlanId,
} from "@/lib/subscription";
import { CouponWallet } from "@/components/CouponWallet";

/**
 * 機能の一覧(chess.com のプラン選択画面にならう。オーナー指示)。選んだプランで使えるものにチェック、使えないものは薄く。
 * soon = まだ提供していない(準備中と表示する)。
 */
const FEATURES: { text: string; icon: IconName; plans: PlanId[]; soon?: boolean }[] = [
  { text: "棋譜解析が無制限(解説付き)", icon: "search", plans: ["silver", "gold", "platinum"] },
  { text: "広告なし", icon: "close", plans: ["silver", "gold", "platinum"], soon: true },
  { text: "GEO DATABASE プリフロップ", icon: "db", plans: ["gold", "platinum"] },
  { text: "GEO DATABASE ポストフロップ以降", icon: "layers", plans: ["gold", "platinum"] },
  { text: "GEO をインマネ回数の条件なしで", icon: "lock", plans: ["platinum"] },
  { text: "データ研究", icon: "stats", plans: ["platinum"] },
  { text: "相手のハンドの公開と解説(ラフくん)", icon: "cards", plans: ["platinum"] },
];

/** タブの並び(上位から。chess.com と同じ)。 */
const TAB_ORDER: PlanId[] = ["platinum", "gold", "silver"];

/** プランの印(SVG)。プラチナ=王冠、ゴールド=星、シルバー=盾。 */
function PlanMark({ plan, active }: { plan: PlanId; active: boolean }) {
  const fill = plan === "platinum" ? "#c7d2dc" : plan === "gold" ? "#f5b70a" : "#9aa3ad";
  return (
    <svg viewBox="0 0 48 48" className={`h-11 w-11 transition-opacity ${active ? "opacity-100" : "opacity-40"}`} aria-hidden>
      {plan === "platinum" && <path d="M6 16l9 8 9-14 9 14 9-8-4 22H10z" fill={fill} stroke="#0A0A0B" strokeWidth="1.5" strokeLinejoin="round" />}
      {plan === "gold" && (
        <path d="M24 5l5.9 12 13.1 1.9-9.5 9.3 2.2 13.1L24 35.1 12.3 41.3l2.2-13.1L5 18.9 18.1 17z" fill={fill} stroke="#0A0A0B" strokeWidth="1.5" strokeLinejoin="round" />
      )}
      {plan === "silver" && <path d="M24 5l16 6v12c0 10-7 17-16 20C15 40 8 33 8 23V11z" fill={fill} stroke="#0A0A0B" strokeWidth="1.5" strokeLinejoin="round" />}
    </svg>
  );
}

const PLAN_ORDER: PlanId[] = ["silver", "gold", "platinum"];

import { ReportErrorButton } from "@/components/ReportErrorButton";
import { Icon, type IconName } from "@/components/Icon";
import { Loader } from "@/components/ui/Loader";

/**
 * プランの選択(料金ページの中身)。`/pricing` のページと、棋譜解析の上に重ねるシート(相手の解説の誘導)で使う。
 * `initialPlan` で最初に開くタブ、`onClose` があれば閉じるボタンはページ移動ではなくそれを呼ぶ。
 */
export function PricingPanel({ initialPlan, onClose }: { initialPlan?: PlanId; onClose?: () => void } = {}) {
  const { accessToken: accessTokenFromAuth } = useAuth();
  const accessToken = accessTokenFromAuth ?? undefined;
  const { status, reload } = useSubscriptionStatus(accessToken);
  const [submitting, setSubmitting] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** クーポン(インフルエンサーの紹介コードなど)。入れて加入すると、その割引で決済画面が開く。 */
  const [promoCode, setPromoCode] = useState("");
  // 選んでいるタブ。既定はおすすめのゴールド(加入中なら今のプラン)。
  const [selected, setSelected] = useState<PlanId>(initialPlan ?? "gold");
  // 局後検討のポップアップから来たときは見出しを合わせる。
  const [fromReview, setFromReview] = useState(false);
  useEffect(() => {
    try {
      setFromReview(new URLSearchParams(window.location.search).get("from") === "review");
    } catch {
      /* 見出しが変わらないだけ */
    }
  }, []);
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
        // 請求額の確認と支払いは Stripe の確認ページで行う。
        await changePlan(accessToken, plan);
        return;
      }
      await startCheckout(accessToken, undefined, plan, promoCode || undefined);
    } catch (e) {
      setSubmitting(null);
      if (e instanceof PromoCodeError) {
        setError(
          e.reason === "invalid_code"
            ? "そのクーポンコードは見つかりませんでした。綴りをご確認ください。"
            : "このクーポンコードは、はじめて有料会員になる方だけが使えます。",
        );
      } else if (e instanceof PortalUpdateDisabledError) {
        setError("いまはプランの変更を受け付けていません。時間をおいて再度お試しください。");
      } else if (e instanceof SubscriptionUnavailableError) {
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
  useEffect(() => {
    if (status?.active && status.plan && status.status !== "referral") setSelected(status.plan);
  }, [status?.active, status?.plan, status?.status]);

  function buttonLabel(plan: PlanId): string {
    if (canChange && currentPlan) {
      return PLAN_ORDER.indexOf(plan) > PLAN_ORDER.indexOf(currentPlan) ? "このプランに上げる" : "このプランに下げる";
    }
    if (trialEligible) return `${trialDays}日間 無料で試す`;
    return byCoupon ? "期間終了後も続けて使う" : "このプランに登録";
  }

  const isCurrent = active && !byCoupon && currentPlan === selected;
  const reduce = useReducedMotion();
  const price = prices[selected];

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-md px-4 pb-16">
        <header className="flex items-center justify-between pb-4 pt-[calc(env(safe-area-inset-top)+12px)]">
          {onClose ? (
            <button type="button" onClick={onClose} aria-label="閉じる" className="pressable flex h-10 w-10 items-center justify-center rounded-full text-fg-2">
              <Icon name="close" className="h-6 w-6" />
            </button>
          ) : (
            <Link href="/" aria-label="閉じる" className="pressable flex h-10 w-10 items-center justify-center rounded-full text-fg-2">
              <Icon name="close" className="h-6 w-6" />
            </Link>
          )}
          <span className="text-[11px] font-semibold tracking-[0.25em] text-accent">POKER ART</span>
          <span className="w-10" />
        </header>

        <h1 className="text-center text-[26px] font-black leading-tight tracking-tight text-fg">
          {fromReview ? "局後検討を無制限に" : "プレミアム会員"}
        </h1>
        {byCoupon && (
          <p className="mt-2 text-center text-[12px] leading-relaxed text-n-9">
            クーポンで無料期間中{couponUntil ? `(${couponUntil} まで)` : ""}。クーポンを追加すると期間が延びます。
          </p>
        )}

        {/* プランのタブ(上位から) */}
        <div role="tablist" aria-label="プラン" className="mt-6 grid grid-cols-3">
          {TAB_ORDER.map((plan) => {
            const on = selected === plan;
            return (
              <button
                key={plan}
                role="tab"
                aria-selected={on}
                onClick={() => setSelected(plan)}
                className="pressable relative flex flex-col items-center gap-1.5 pb-3 pt-4"
              >
                {plan === "gold" && (
                  <span className="absolute -top-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-black text-on-accent">
                    おすすめ
                  </span>
                )}
                <PlanMark plan={plan} active={on} />
                <span className={`text-[14px] font-black ${on ? "text-fg" : "text-fg-3"}`}>{PLAN_LABEL[plan]}</span>
                {active && !byCoupon && currentPlan === plan && <span className="text-[10px] font-bold text-accent">加入中</span>}
              </button>
            );
          })}
        </div>

        {/* プランを選ぶトグル(絵のタブの下。オーナー指示) */}
        <div className="mt-4">
          <PlanToggle plans={TAB_ORDER} labels={PLAN_LABEL} value={selected} onChange={setSelected} />
        </div>

        {/* 機能の一覧 */}
        <ul className="mt-5 list-rows rounded-2xl border border-line bg-surface p-1 [--row-inset:44px]">
          {FEATURES.map((f) => {
            const has = f.plans.includes(selected);
            return (
              <motion.li
                key={f.text}
                animate={{ opacity: has ? 1 : 0.35 }}
                transition={FADE}
                className="flex items-center gap-3 px-3.5 py-3"
              >
                <Icon name={f.icon} className="h-5 w-5 shrink-0 text-accent" />
                <span className="flex-1 text-[14px] font-bold text-fg">
                  {f.text}
                  {f.soon && <span className="ml-1.5 text-[10px] font-bold text-fg-2">準備中</span>}
                </span>
                {has ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                    <Icon name="check" className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-fg-3">
                    <Icon name="minus" className="h-3.5 w-3.5" />
                  </span>
                )}
              </motion.li>
            );
          })}
        </ul>

        {selected === "gold" && (
          <p className="mt-2 text-[11px] leading-relaxed text-fg-3">
            ゴールドの GEO は、インマネ10回でプリフロップ、20回でポストフロップ以降が開きます。
          </p>
        )}

        {/* 価格と決定ボタンは、画面下に浮く半透明の帯にまとめる(Apple の購入シートと同じく、いつでも押せる位置に)。 */}
        <div className="glass-footer sticky bottom-0 z-10 -mx-4 mt-6 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
        {/* 価格(月額のみ) */}
        <div className="text-center">
          <p className="tracking-[-0.02em]">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={price}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={reduce ? FADE : SPRING_MOVE}
                className="inline-block text-[32px] font-black tabular-nums text-fg"
              >
                ¥{price.toLocaleString()}
              </motion.span>
            </AnimatePresence>
            <span className="ml-1 text-[14px] font-bold text-fg-2">/ 月(税込)</span>
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-fg-3">
            {trialEligible && !active
              ? `はじめての方は${trialDays}日間無料。体験終了後は月額で自動更新、体験中に解約すれば料金はかかりません。`
              : "月額・いつでも解約できます。"}
          </p>
        </div>

        {/* 決定ボタン */}
        {isCurrent ? (
          <div className="mt-4 flex h-14 items-center justify-center gap-1.5 rounded-2xl bg-accent/15 text-[15px] font-black text-accent">
            <Icon name="check" className="h-5 w-5" />
            {PLAN_LABEL[selected]}に加入中
          </div>
        ) : (
          <>
          {/* クーポン(インフルエンサーの紹介コードなど)。新しく加入するときだけ(プラン変更には使えない)。 */}
          {!canChange && (
            <input
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))}
              placeholder="クーポンコード(お持ちの方)"
              aria-label="クーポンコード"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="mx-auto mt-4 block h-10 w-[62%] rounded-xl border border-line bg-surface px-3 text-center text-[13px] font-bold tracking-[0.12em] text-fg placeholder:font-normal placeholder:tracking-normal placeholder:text-fg-3 focus:border-accent focus:outline-none"
            />
          )}
          <button
            onClick={() => void handleSubscribe(selected)}
            // Stripe の契約が無い加入(管理者の付与など)は Checkout で新しく契約できる(サーバーも許す)。
            disabled={submitting != null}
            className={`premium-btn pressable ${canChange ? "mt-4" : "mt-2.5"} h-14 w-full disabled:opacity-60`}
          >
            {/* 星が流れる背景と、下のピンク/紫の光(出典: uiverse.io by StealthWorm。オーナー指示) */}
            <span aria-hidden className="premium-btn-stars"><span className="premium-btn-stars-inner" /></span>
            <span aria-hidden className="premium-btn-glow">
              <span className="premium-btn-circle" />
              <span className="premium-btn-circle" />
            </span>
            <strong className="relative z-[2] text-[16px] font-black tracking-[0.06em] text-white">
              {submitting === selected ? <Loader size="sm" /> : canChange && currentPlan ? `${PLAN_LABEL[selected]}に${buttonLabel(selected).includes("上げる") ? "上げる" : "下げる"}` : trialEligible ? `${trialDays}日間 無料で試す` : "さあプレミアム会員に"}
            </strong>
          </button>
          </>
        )}
        </div>

        {canChange && (
          <p className="mt-2 text-center text-[11px] leading-relaxed text-fg-3">
            差額は日割りで、上げるときはその場で請求、下げるときは次回以降の請求から差し引きます。
          </p>
        )}
        {active && !byCoupon && (
          <button
            onClick={handleManage}
            className="pressable mt-3 w-full rounded-full border border-line-strong py-3 text-[13px] font-bold text-fg"
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
        <div className="mt-6">
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
