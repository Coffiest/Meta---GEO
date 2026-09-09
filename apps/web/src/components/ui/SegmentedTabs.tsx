"use client";

/**
 * ページ内のタブ切り替え(リーダーボードの期間・指標、履歴の絞り込み等)。
 *
 * 選択状態を「文字色が変わる」ではなく「面が滑ってくる」ことで示す
 * (出典: uiverse.io by Pradeepsaranbishnoi)。どこから来てどこへ行ったかを
 * 目で追えるので、押した結果がどこに反映されたのか分かる。
 *
 * 原案は radio + CSS だけで位置を出しているが、項目数が画面ごとに違うため、
 * グライダーの幅と移動量はここから比率で渡す。項目は等幅にして、
 * `translateX(index * 100%)` だけで位置が決まるようにしてある。
 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  items: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const index = Math.max(0, items.findIndex((i) => i.key === value));
  const pct = 100 / Math.max(1, items.length);

  return (
    <div role="tablist" aria-label={ariaLabel} className={`segmented ${className}`}>
      <span
        aria-hidden="true"
        className="segmented-glider"
        style={{ width: `calc(${pct}% - 0.6rem * ${pct / 100})`, transform: `translateX(${index * 100}%)` }}
      />
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={`pressable flex flex-1 items-center justify-center whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
              active ? "text-on-accent" : "text-fg-3"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
