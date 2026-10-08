"use client";

/**
 * 棋譜解析を開く「星」のボタン(chess.com の解析ボタンと同じ、緑の角丸の四角に白い星。オーナー指示)。
 * 緑はアクセント1色の決まりの例外(オーナー確定)。
 */
export function ReviewStarButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className="pressable grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-[#81B64C]"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="none" stroke="#fff" strokeWidth="2" />
        <path
          d="M12 6.6l1.6 3.3 3.6.5-2.6 2.5.6 3.6L12 14.8l-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z"
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
