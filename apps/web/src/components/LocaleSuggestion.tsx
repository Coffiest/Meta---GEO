"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";
import { LOCALES, translate, useI18n } from "@/lib/i18n";
import { SPRING_SHEET } from "@/lib/motion";

/**
 * 「◯◯語で表示しますか?」の提案。端末の言語と国の言語が食い違うときだけ出す
 * (自動では切り替えない。VPN・旅行者・移住者で外れるため)。文言は提案する言語そのもので書く
 * (その言語を読む人に向けた提案なので)。切り替えるか閉じると、二度と同じ提案はしない。
 */
export function LocaleSuggestion() {
  const { suggestion, setLocale, dismissSuggestion } = useI18n();
  const label = LOCALES.find((l) => l.code === suggestion)?.label ?? "";
  return (
    <AnimatePresence>
      {suggestion && (
        <motion.div
          key={suggestion}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={SPRING_SHEET}
          className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+72px)] z-[80] mx-auto flex w-[calc(100%-32px)] max-w-md items-center gap-3 rounded-2xl bg-surface-2 py-2.5 pl-4 pr-2 shadow-e3"
          role="dialog"
          aria-live="polite"
          lang={suggestion}
        >
          <p className="min-w-0 flex-1 text-[13px] font-bold text-fg">{translate(suggestion, "locale.suggest", { lang: label })}</p>
          <button
            type="button"
            onClick={() => setLocale(suggestion)}
            className="pressable shrink-0 rounded-full bg-accent/15 px-3.5 py-1.5 text-[12px] font-black text-accent ring-1 ring-accent"
          >
            {translate(suggestion, "locale.switch")}
          </button>
          <button
            type="button"
            onClick={dismissSuggestion}
            aria-label={translate(suggestion, "locale.dismiss")}
            className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-2"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
