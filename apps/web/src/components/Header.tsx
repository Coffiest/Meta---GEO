"use client";

import { Icon } from "./Icon";

/**
 * アプリ全体で共有するヘッダー。sticky + ガラス(背景ぼかし+彩度強調)のバーで、下の
 * コンテンツはこの下を流れていく(不透明な帯で画面上端を消費しない)。min-h-[64px]・
 * px-5 py-3、左にロゴ+ワードマーク、右に円形のボーダーのみアイコンボタン列。
 * 全画面が同一のダークテーマなので、画面ごとの色調の出し分けは持たない。
 */
export function Header({
  left,
  right,
  widthClass = "max-w-3xl",
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  /** バー内側の最大幅。PC(lg)で本文を広く使う画面(GEO DATABASE)はここを広げて本文と幅を揃える。 */
  widthClass?: string;
}) {
  return (
    <header className="glass-header sticky top-0 z-30">
      <div className={`mx-auto flex min-h-[64px] items-center justify-between gap-3 px-5 py-3 ${widthClass}`}>
        <div className="flex items-center min-w-0 flex-1">{left}</div>
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
      </div>
    </header>
  );
}

/** メインロゴ画像。 */
const LOGO_SRC = "/logos/Logo_s.png";

/** RRPokerのロゴ(60x60画像+ワードマーク)と全く同じ寸法のロゴ枠。 */
export function HeaderLogo() {
  return (
    <div className="flex items-center gap-2 text-[18px] font-semibold tracking-tight text-fg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_SRC} alt="Poker ART" className="h-11 w-11 shrink-0 rounded-2xl object-contain" />
      <span className="inline-flex items-center gap-1.5">
        Poker<span className="text-accent">ART</span>
        {/* 常時点滅する「オンライン」LED(出典: uiverse.io by Jarol20cb / kamehame-ha を
            踏まえたハッカー/コンソール演出)。全画面共通のヘッダーに乗るので、さりげない
            端末感を全画面に行き渡らせる役目を持つ。 */}
        <span className="term-led" aria-hidden="true" />
      </span>
    </div>
  );
}

/** RRPokerのアイコンボタンと同じ寸法(h-10 w-10の円形、ボーダーのみ・塗りつぶしなし)。 */
export function HeaderIconButton({
  onClick,
  ariaLabel,
  children,
  href,
}: {
  onClick?: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  href?: string;
}) {
  const className =
    "pressable relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-n-10";
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

export function HamburgerIcon({ open = false, className = "" }: { open?: boolean; className?: string }) {
  return (
    <span aria-hidden="true" data-open={open} className={`hamburger ${className}`}>
      <span className="bar bar-top" />
      <span className="bar bar-mid" />
      <span className="bar bar-bottom" />
    </span>
  );
}

/** 1文字あたりの表示間隔(ms)。TermPromptのタイプ所要時間を揃えて計算するため公開する。 */
const TERM_TYPE_MS_PER_CHAR = 45;

/** {@link TermPrompt} のタイプ所要時間(ms)。後続コンテンツを「打ち終わってから出す」ために使う。 */
export function termTypeMs(command: string): number {
  return command.length * TERM_TYPE_MS_PER_CHAR;
}

/**
 * "$ コマンド"をタイプライター風に表示するコンソール演出(出典: uiverse.io by
 * kamehame-ha / Jarol20cb)。このアプリは全面モノスペースフォント固定のため、
 * 文字数ぶんの steps() がそのまま等幅の1文字ずつの表示になる。打ち終わりの位置に
 * 点滅カーソルを残す。各タブ見出し(TabHeader)・GEO Databaseページの見出しで使う。
 */
export function TermPrompt({ command, className = "" }: { command: string; className?: string }) {
  const ms = termTypeMs(command);
  return (
    <div className={`flex items-center gap-1.5 font-mono text-[11px] text-fg-3 ${className}`}>
      <span className="text-accent">$</span>
      <span
        className="term-type inline-block overflow-hidden whitespace-nowrap align-bottom"
        style={{ "--term-type-steps": command.length, animationDuration: `${ms}ms` } as React.CSSProperties}
      >
        {command}
      </span>
      <span
        className="term-cursor shrink-0 bg-fg-3"
        style={{ width: 5, height: 11, animationDelay: `${ms}ms` }}
        aria-hidden="true"
      />
    </div>
  );
}
