"use client";

/**
 * チェックボックス。アプリ全体でこの1つに統一する。
 *
 * ONになった瞬間にレ点のパスを描き進める(出典: uiverse.io by PriyanshuGupta28)。
 * 塗りが切り替わるだけだと「もともとそうだった」のか「今変わった」のか区別が付かないが、
 * 線が引かれる過程が見えると、自分の操作が効いたことがそのまま伝わる。
 *
 * 色は `currentColor`。置いた場所の文字色に追従するので、呼び出し側で色を渡さない。
 */
export function CheckMark({ on, className = "h-[18px] w-[18px]" }: { on: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-on={on}
      className={`check-mark ${className}`}
    >
      <rect className="box" x="3" y="3" width="18" height="18" rx="6" strokeWidth={1.6} />
      <path className="tick" d="M7.6 12.3l3 3L16.6 8.9" strokeWidth={2.4} />
    </svg>
  );
}
