"use client";

/**
 * アプリ全体で共有するヘッダー。以前は各画面が背景・境界線なしのバラバラなヘッダーを
 * 個別実装していた(「なんちゃってヘッダー」)。これに代わり、sticky+背景ぼかし+下境界線を
 * 持つ、きちんとしたアプリバーとしてのヘッダーを1箇所にまとめる。左右の中身は画面ごとに
 * 差し替え可能(left/right スロット)。
 */
const TONE_CLASS: Record<"light" | "dark", string> = {
  light: "bg-ink-50/95 border-ink-300/70",
  dark: "bg-navy-950/95 border-navy-800",
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
    <header
      className={`sticky top-0 z-20 flex items-center justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 backdrop-blur border-b ${TONE_CLASS[tone]}`}
    >
      <div className="flex items-center min-w-0 flex-1">{left}</div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </header>
  );
}

/** ロゴ配置枠(準備中): 今後作成予定のロゴ画像/SVGに差し替える。それまでは簡易ワードマーク表示。 */
export function HeaderLogo() {
  return (
    <div className="h-8 flex items-center px-1">
      <span className="text-[15px] font-black italic tracking-wide text-ink-950">
        GTO<span className="text-gold-600">Poker</span>
      </span>
    </div>
  );
}

const ICON_BUTTON_TONE_CLASS: Record<"light" | "dark", string> = {
  light: "bg-ink-100 ring-ink-400/70 text-ink-850 active:bg-ink-200",
  dark: "bg-navy-900 ring-navy-700/60 text-navy-200 active:bg-navy-800",
};

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
  const className = `h-9 w-9 shrink-0 flex items-center justify-center rounded-full ring-1 transition-colors ${ICON_BUTTON_TONE_CLASS[tone]}`;
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
