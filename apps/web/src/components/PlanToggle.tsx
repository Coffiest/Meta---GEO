"use client";

import { motion, useReducedMotion } from "framer-motion";
import { FADE } from "@/lib/motion";
import type { PlanId } from "@/lib/subscription";

/**
 * プランを選ぶガラスのトグル(出典: uiverse.io by chase2k25「glass-radio-group」)。
 * 光る板(glider)の色はプランの金属色(銀・金・水色)。プランを区別するための色なので、
 * アクセント1色の決まりの例外(オーナー確定)。動きは元の弾むカーブと同じくらい弾むスプリング
 * (連打しても途中から向きを変えられる)。
 */
const GLIDER: Record<PlanId, { background: string; boxShadow: string }> = {
  silver: {
    background: "linear-gradient(135deg, #c0c0c055, #e0e0e0)",
    boxShadow: "0 0 18px rgba(192, 192, 192, 0.5), 0 0 10px rgba(255, 255, 255, 0.4) inset",
  },
  gold: {
    background: "linear-gradient(135deg, #ffd70055, #ffcc00)",
    boxShadow: "0 0 18px rgba(255, 215, 0, 0.5), 0 0 10px rgba(255, 235, 150, 0.4) inset",
  },
  platinum: {
    background: "linear-gradient(135deg, #d0e7ff55, #a0d8ff)",
    boxShadow: "0 0 18px rgba(160, 216, 255, 0.5), 0 0 10px rgba(200, 240, 255, 0.4) inset",
  },
};

/** 元の cubic-bezier(0.37, 1.95, 0.66, 0.56) / 0.5s に近い、大きく弾むスプリング。 */
const GLIDE_SPRING = { type: "spring", bounce: 0.45, duration: 0.5 } as const;

export function PlanToggle({
  plans,
  labels,
  value,
  onChange,
}: {
  plans: readonly PlanId[];
  labels: Record<PlanId, string>;
  value: PlanId;
  onChange: (plan: PlanId) => void;
}) {
  const reduce = useReducedMotion();
  const index = Math.max(0, plans.indexOf(value));
  return (
    <div
      role="radiogroup"
      aria-label="プラン"
      className="relative mx-auto flex w-full overflow-hidden rounded-2xl backdrop-blur-md"
      style={{
        background: "rgba(255, 255, 255, 0.06)",
        boxShadow:
          "inset 1px 1px 4px rgba(255, 255, 255, 0.2), inset -1px -1px 6px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.15)",
      }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-0 z-[1] rounded-2xl"
        style={{ width: `${100 / plans.length}%` }}
        initial={false}
        animate={{ x: `${index * 100}%`, ...GLIDER[value] }}
        transition={reduce ? FADE : { x: GLIDE_SPRING, background: { duration: 0.4 }, boxShadow: { duration: 0.4 } }}
      />
      {plans.map((plan) => {
        const on = plan === value;
        return (
          <button
            key={plan}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(plan)}
            className={`pressable relative z-[2] flex min-w-[80px] flex-1 items-center justify-center px-4 py-3 text-[14px] font-semibold tracking-[0.3px] transition-colors duration-300 ${
              on ? "text-white" : "text-[#e5e5e5] hover:text-white"
            }`}
          >
            {labels[plan]}
          </button>
        );
      })}
    </div>
  );
}
