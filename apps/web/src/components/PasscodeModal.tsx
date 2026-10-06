"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { SPRING_SNAPPY } from "@/lib/motion";
import { Icon } from "./Icon";

/**
 * 4桁パスコード入力モーダル(GEO近日公開画面の隠しゲートと同じ意匠)。
 *
 * **答えは画面に持たない。** 照合はサーバーだけで行う(`verify`)。以前は正解を画面のコードに平文で持っていたため、
 * 配信される JS から誰でも読めた。`verify` を渡さなければ、入力をそのまま onSuccess に渡す(サーバー側で判定する手続き向け)。
 */
export function PasscodeModal({
  title,
  verify,
  onSuccess,
  onClose,
}: {
  title: string;
  /** サーバーで答え合わせする。true なら onSuccess。 */
  verify?: (code: string) => Promise<boolean>;
  onSuccess: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);

  async function submitCode(next: string) {
    if (next.length < 4) return;
    if (!verify) {
      onSuccess(next);
      return;
    }
    setChecking(true);
    const ok = await verify(next).catch(() => false);
    setChecking(false);
    if (ok) {
      onSuccess(next);
      return;
    }
    setWrong(true);
    setTimeout(() => {
      setWrong(false);
      setCode("");
    }, 500);
  }

  function pushDigit(d: string) {
    if (code.length >= 4 || checking) return;
    const next = code + d;
    setCode(next);
    if (next.length === 4) void submitCode(next);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-8"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={SPRING_SNAPPY}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[300px] glass-panel rounded-sheet p-6 shadow-e4"
      >
        <p className="text-center text-[10px] font-black uppercase tracking-[0.3em] text-fg-3">Access code</p>
        <p className="mt-1 text-center text-[15px] font-black tracking-tight text-fg">{title}</p>

        <motion.div
          animate={wrong ? { x: [0, -10, 10, -8, 8, 0] } : { x: 0 }}
          transition={{ duration: 0.5 }}
          className="mt-5 flex justify-center gap-3"
        >
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full border ${
                wrong ? "border-crimson-500 bg-crimson-500" : code.length > i ? "border-line-strong bg-n-4" : "border-line bg-transparent"
              }`}
            />
          ))}
        </motion.div>

        <div className="mt-6 grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => pushDigit(d)}
              className="pressable cursor-pointer rounded-2xl glass-panel py-3 text-[20px] font-black text-fg"
            >
              {d}
            </button>
          ))}
          <button
            onClick={onClose}
            className="pressable cursor-pointer rounded-2xl py-3 text-[12px] font-bold text-fg-2"
          >
            閉じる
          </button>
          <button
            onClick={() => pushDigit("0")}
            className="pressable cursor-pointer rounded-2xl glass-panel py-3 text-[20px] font-black text-fg"
          >
            0
          </button>
          <button
            onClick={() => setCode((c) => c.slice(0, -1))}
            aria-label="1文字削除"
            className="pressable flex cursor-pointer items-center justify-center rounded-2xl py-3 text-fg-2"
          >
            <Icon name="backspace" className="h-5 w-5" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
