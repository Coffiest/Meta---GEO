"use client";

import { LOCALES, useI18n } from "@/lib/i18n";
import { SegmentedTabs } from "./ui/SegmentedTabs";

/**
 * 言語切替のセグメントコントロール(JA / EN / KO / ZH)。どこに置いてもよう最小構成にし、
 * ログイン画面・設定メニューなどから呼び出す。選択中の言語をガラス片が滑って示す
 * (共通の SegmentedTabs を使用)。変更は即時反映され、localStorage に保存されるため
 * 次回以降も維持される。
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <SegmentedTabs
      ariaLabel="Language"
      className={className}
      items={LOCALES.map((l) => ({ key: l.code, label: l.short }))}
      value={locale}
      onChange={setLocale}
    />
  );
}
