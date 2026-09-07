"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "./Icon";
import { Button } from "./ui/Button";

/**
 * テンキーは3列グリッドのセルいっぱいに広がるため、Buttonの標準サイズ(左右padding付き)を
 * 使わず size="none" にして寸法をここで決める。数字は大きく、補助操作は小さく。
 */
const KEYPAD_KEY = "w-full py-3 text-[20px] active:scale-90";
const KEYPAD_LABEL = "w-full py-3 text-[12px] active:scale-90";

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
            <Button key={d} onClick={() => pushDigit(d)} variant="secondary" size="none" className={KEYPAD_KEY}>
              {d}
            </Button>
          ))}
          <Button onClick={onClose} variant="ghost" size="none" className={KEYPAD_LABEL}>
            閉じる
          </Button>
          <Button onClick={() => pushDigit("0")} variant="secondary" size="none" className={KEYPAD_KEY}>
            0
          </Button>
          <Button
            onClick={() => setCode((c) => c.slice(0, -1))}
            aria-label="1文字削除"
            variant="ghost"
            size="none"
            className={KEYPAD_LABEL}
          >
            <Icon name="backspace" className="h-5 w-5" />
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
