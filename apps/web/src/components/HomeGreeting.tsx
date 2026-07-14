"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/** 時刻帯に応じた挨拶。5時未満・18時以降は「こんばんは」。 */
function greetingFor(hour: number): string {
  if (hour < 5) return "こんばんは";
  if (hour < 11) return "おはよう";
  if (hour < 18) return "こんにちは";
  return "こんばんは";
}

/**
 * ホーム画面の挨拶ヒーロー。時刻連動の挨拶+プレイヤー名で「ようこそ」を演出し、
 * ホームに入口としての存在感を与える(Swiss: ゴールドの点マーカー+uppercaseキッカー
 * +大きめ見出し+一言)。時刻はハイドレーション不一致を避けるためマウント後に確定する。
 */
export function HomeGreeting({ displayName }: { displayName: string }) {
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => setGreeting(greetingFor(new Date().getHours())), []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="px-1 pt-1"
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-400">Poker ART · Tournament</span>
      </div>
      <h1 className="mt-2 text-[26px] font-black leading-tight tracking-tight text-ink-950">
        {greeting ? `${greeting}、` : ""}
        <span className="break-all">{displayName}</span>
        <span className="text-gold-500">.</span>
      </h1>
      <p className="mt-1 text-[13px] text-ink-500">今日も、GTOの先へ。</p>
    </motion.div>
  );
}
