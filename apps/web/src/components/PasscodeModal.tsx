"use client";

import { useState } from "react";
import { motion } from "framer-motion";

/**
 * 4桁パスコード入力モーダル(GEO近日公開画面の隠しゲートと同じ意匠)。
 * expected と一致したら onSuccess を呼ぶ。ログイン画面→管理者画面の入口などで共用する。
 */
export function PasscodeModal({
  expected,
  title,
  onSuccess,
  onClose,
}: {
  expected: string;
  title: string;
  onSuccess: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);

  function submitCode(next: string) {
    if (next === expected) {
      onSuccess(next);
      return;
    }
    if (next.length >= 4) {
      setWrong(true);
      setTimeout(() => {
        setWrong(false);
        setCode("");
      }, 500);
    }
  }

  function pushDigit(d: string) {
    if (code.length >= 4) return;
    const next = code + d;
    setCode(next);
    if (next.length === 4) submitCode(next);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-8"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[300px] rounded-[26px] border border-ink-950 bg-white p-6"
      >
        <p className="text-center text-[10px] font-black uppercase tracking-[0.3em] text-ink-400">Access code</p>
        <p className="mt-1 text-center text-[15px] font-black tracking-tight text-ink-950">{title}</p>

        <motion.div
          animate={wrong ? { x: [0, -10, 10, -8, 8, 0] } : { x: 0 }}
          transition={{ duration: 0.5 }}
          className="mt-5 flex justify-center gap-3"
        >
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full border ${
                wrong ? "border-crimson-500 bg-crimson-500" : code.length > i ? "border-ink-950 bg-ink-950" : "border-ink-400 bg-transparent"
              }`}
            />
          ))}
        </motion.div>

        <div className="mt-6 grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => pushDigit(d)}
              className="cursor-pointer rounded-2xl border border-ink-950 bg-white py-3 text-[20px] font-black text-ink-950 transition-transform active:scale-90"
            >
              {d}
            </button>
          ))}
          <button
            onClick={onClose}
            className="cursor-pointer rounded-2xl py-3 text-[12px] font-bold text-ink-500 transition-transform active:scale-90"
          >
            閉じる
          </button>
          <button
            onClick={() => pushDigit("0")}
            className="cursor-pointer rounded-2xl border border-ink-950 bg-white py-3 text-[20px] font-black text-ink-950 transition-transform active:scale-90"
          >
            0
          </button>
          <button
            onClick={() => setCode((c) => c.slice(0, -1))}
            aria-label="1文字削除"
            className="flex cursor-pointer items-center justify-center rounded-2xl py-3 text-ink-500 transition-transform active:scale-90"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
              <path d="M9 5h11v14H9l-6-7 6-7Z" strokeLinejoin="round" />
              <path d="m13 9 4 6m0-6-4 6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
