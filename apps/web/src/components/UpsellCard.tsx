"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { useI18n } from "@/lib/i18n";
import { SPRING_SNAPPY } from "@/lib/motion";
import { useSubscriptionStatus } from "@/lib/subscription";

/**
 * 無料の人にだけ出す、プランの案内カード(押し付けない「中」の強さ。1画面に1つまでの強いアクセントは使わない)。
 *
 * 出す場所は「いま欲しくなった瞬間」に限る(価値を体験した直後・できないことに当たった瞬間)。
 * 文脈に合わせた案内は、汎用の案内より加入率が高い(RevenueCat / Adapty などの調査)。
 * 特定のプランは勧めず、料金ページでシルバー/ゴールド/プラチナから選んでもらう(オーナー指示)。
 * 閉じたら3日間は出さない(しつこく出すと逆効果)。無料体験が使える人には「7日間無料」を前に出す。
 * 煽り(残り時間のカウントダウン・在庫切れなど)は使わない(景品表示法の有利誤認にならないように)。
 */
const SNOOZE_KEY = "pokerart.upsellSnoozedUntil.v1";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export function UpsellCard({ accessToken }: { accessToken: string | undefined }) {
  const { t } = useI18n();
  const { status, loading } = useSubscriptionStatus(accessToken);
  const [snoozed, setSnoozed] = useState(true);
  useEffect(() => {
    try {
      setSnoozed(Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now());
    } catch {
      setSnoozed(false);
    }
  }, []);
  if (!accessToken || loading || !status || status.active || snoozed) return null;

  const trial = status.trialEligible ?? false;
  const days = status.trialDays ?? 7;
  const dismiss = () => {
    setSnoozed(true);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      /* 保存できなくても閉じる */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_SNAPPY, delay: 0.4 }}
      className="relative mt-3 rounded-2xl bg-accent/15 p-4 ring-1 ring-inset ring-accent"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("common.close")}
        className="pressable absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-fg-3"
      >
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
      <p className="pr-6 text-[14px] font-black leading-snug text-fg">{t("upsell.title")}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-fg-2">{t("upsell.body")}</p>
      <Link
        href="/pricing"
        className="pressable mt-3 flex items-center justify-center gap-1.5 rounded-full border border-accent py-2.5 text-[13px] font-black text-accent"
      >
        {trial ? t("upsell.ctaTrial", { n: days }) : t("upsell.cta")}
        <Icon name="chevron-right" className="h-4 w-4" />
      </Link>
      {trial && <p className="mt-1.5 text-center text-[10px] text-fg-3">{t("upsell.trialNote")}</p>}
    </motion.div>
  );
}
