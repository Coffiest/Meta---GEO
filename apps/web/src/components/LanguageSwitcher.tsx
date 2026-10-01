"use client";

import { LOCALES, useI18n, type Locale } from "@/lib/i18n";
import { Icon } from "./Icon";

/**
 * 言語切替。対応言語が7つに増え、横並びのセグメントではスマホのヘッダーに収まらなくなったため、
 * 「いまの言語の短い表記+下向きシェブロン」の小さなピルにし、押すとOS標準の選択メニューが開く形にした
 * (ネイティブの select は、iOS ではホイール、PC ではドロップダウンになり、読み上げにも対応している)。
 * 選んだ言語は localStorage に保存され、次回以降も自動判定より優先される。
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const current = LOCALES.find((l) => l.code === locale);
  return (
    <label
      className={`pressable relative inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 pl-3 pr-2.5 text-[12px] font-bold text-fg ${className}`}
    >
      <span aria-hidden>{current?.label ?? locale}</span>
      <Icon name="chevron-down" className="h-3.5 w-3.5 text-fg-2" />
      <select
        aria-label="Language"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
