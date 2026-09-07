"use client";

import { LOCALES, useI18n } from "@/lib/i18n";

/**
 * 言語切替のセグメントコントロール(JA / EN / KO / ZH)。どこに置いてもよう最小構成にし、
 * ログイン画面・設定メニューなどから呼び出す。選択中の言語を黒背景で強調する。
 * 変更は即時反映され、localStorage に保存されるため次回以降も維持される。
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center gap-1 rounded-full glass-panel p-0.5 ${className}`}
    >
      {LOCALES.map((l) => {
        const active = l.code === locale;
        return (
          <button
            key={l.code}
            onClick={() => setLocale(l.code)}
            aria-pressed={active}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide transition-colors ${
              active ? "bg-n-4 text-white" : "text-fg-2 hover:text-fg"
            }`}
          >
            {l.short}
          </button>
        );
      })}
    </div>
  );
}
