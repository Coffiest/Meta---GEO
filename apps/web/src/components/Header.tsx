"use client";

/**
 * アプリ全体で共有するヘッダー。RRPoker(components/HomeHeader.tsx)のヘッダーと
 * 全く同じ寸法・デザインパターンに揃えている: sticky+背景ぼかし+下境界線のバー、
 * min-h-[64px]・px-5 py-3、左に60x60のロゴ+ワードマーク、右に円形(h-10 w-10)の
 * ボーダーのみアイコンボタン列。色調だけは画面のテーマ(light/dark)に応じて出し分ける
 * (GEO DATABASEのような紺基調の画面に白いバーを強制すると浮いてしまうため)。
 */
const BAR_TONE_CLASS: Record<"light" | "dark", string> = {
  light: "border-ink-300/70 bg-ink-50/80",
  dark: "border-navy-800 bg-navy-950/80",
};

const WORDMARK_TONE_CLASS: Record<"light" | "dark", string> = {
  light: "text-ink-950",
  dark: "text-navy-50",
};

export function Header({
  left,
  right,
  tone = "light",
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  /** GEO DATABASEページ等、既存のnavyダークテーマを維持する画面向け。 */
  tone?: "light" | "dark";
}) {
  return (
    <header className={`sticky top-0 z-20 border-b backdrop-blur-sm ${BAR_TONE_CLASS[tone]}`}>
      <div className="mx-auto flex min-h-[64px] max-w-3xl items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center min-w-0 flex-1">{left}</div>
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
      </div>
    </header>
  );
}

/** RRPokerのロゴ(60x60画像+ワードマーク)と全く同じ寸法のロゴ枠。画像アセットが無いため、代わりにグラデーションのバッジを敷く。 */
export function HeaderLogo({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <div className={`flex items-center gap-2 text-[18px] font-semibold ${WORDMARK_TONE_CLASS[tone]}`}>
      <div className="h-[60px] w-[60px] shrink-0 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-panel">
        <span className="text-navy-950 text-lg font-black italic">G</span>
      </div>
      <span>
        GTO<span className="text-gold-600">Poker</span>
      </span>
    </div>
  );
}

const ICON_BUTTON_TONE_CLASS: Record<"light" | "dark", string> = {
  light: "border-ink-400/70 text-ink-700 hover:border-ink-500",
  dark: "border-navy-700 text-navy-200 hover:border-navy-500",
};

/** RRPokerのアイコンボタンと同じ寸法(h-10 w-10の円形、ボーダーのみ・塗りつぶしなし)。 */
export function HeaderIconButton({
  onClick,
  ariaLabel,
  children,
  href,
  tone = "light",
}: {
  onClick?: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  href?: string;
  tone?: "light" | "dark";
}) {
  const className = `relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${ICON_BUTTON_TONE_CLASS[tone]}`;
  if (href) {
    return (
      <a href={href} aria-label={ariaLabel} className={className}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} aria-label={ariaLabel} className={className}>
      {children}
    </button>
  );
}

export function HamburgerIcon({ className = "h-4.5 w-4.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}
