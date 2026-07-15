"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";

/** 時刻帯に応じた挨拶キー。5時未満・18時以降は evening。 */
function greetingKeyFor(hour: number): string {
  if (hour < 5) return "greeting.evening";
  if (hour < 11) return "greeting.morning";
  if (hour < 18) return "greeting.day";
  return "greeting.evening";
}

/**
 * ホーム画面の挨拶ヒーロー。時刻連動の挨拶+プレイヤー名で「ようこそ」を演出し、
 * ホームに入口としての存在感を与える(Swiss: ゴールドの点マーカー+uppercaseキッカー
 * +大きめ見出し+一言)。時刻はハイドレーション不一致を避けるためマウント後に確定する。
 */
export function HomeGreeting({ displayName }: { displayName: string }) {
  const { t } = useI18n();
  const [greetingKey, setGreetingKey] = useState<string | null>(null);
  useEffect(() => setGreetingKey(greetingKeyFor(new Date().getHours())), []);
  const greeting = greetingKey ? t(greetingKey) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="px-1 pt-1"
    >
      <h1 className="text-[26px] font-black leading-tight tracking-tight text-ink-950">
        {greeting ? `${greeting}${t("greeting.comma")}` : ""}
        <span className="break-all">{displayName}</span>
        <span className="text-gold-500">.</span>
      </h1>
      <p className="mt-1 text-[13px] text-ink-500">{t("home.tagline")}</p>
    </motion.div>
  );
}
