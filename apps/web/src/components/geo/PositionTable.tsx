"use client";

/**
 * GTO Wizardの「Study」最初の画面にあるポジション選択用の楕円テーブル図。
 * ボタンを並べるだけの簡易UIではなく、実際の座席配置を模した図をクリックして選ぶ。
 */
const SEATS: { key: string; angleDeg: number }[] = [
  { key: "UTG", angleDeg: -90 },
  { key: "HJ", angleDeg: -30 },
  { key: "CO", angleDeg: 30 },
  { key: "BTN", angleDeg: 90 },
  { key: "SB", angleDeg: 150 },
  { key: "BB", angleDeg: -150 },
];

export function PositionTable({ position, onChange }: { position: string; onChange: (p: string) => void }) {
  const cx = 150;
  const cy = 88;
  const rx = 118;
  const ry = 54;

  return (
    <svg viewBox="0 0 300 176" className="w-full max-w-[280px] mx-auto">
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} className="fill-felt-800" stroke="#0a1712" strokeWidth={4} />
      <ellipse cx={cx} cy={cy} rx={rx - 16} ry={ry - 16} className="fill-none stroke-ink-50/10" strokeWidth={1} />
      {SEATS.map((seat) => {
        const rad = (seat.angleDeg * Math.PI) / 180;
        const x = cx + Math.cos(rad) * (rx + 4);
        const y = cy + Math.sin(rad) * (ry + 4);
        const isActive = seat.key === position;
        return (
          <g
            key={seat.key}
            onClick={() => onChange(seat.key)}
            className="cursor-pointer"
            role="button"
            aria-label={`${seat.key}のレンジを表示`}
          >
            <circle
              cx={x}
              cy={y}
              r={18}
              className={isActive ? "fill-mint-500" : "fill-ink-800 hover:fill-ink-700 transition-colors"}
              stroke={isActive ? "#7adcae" : "#2e2e33"}
              strokeWidth={isActive ? 2 : 1.5}
            />
            <text
              x={x}
              y={y + 4}
              textAnchor="middle"
              className={`text-[11px] font-bold ${isActive ? "fill-ink-950" : "fill-ink-300"}`}
              style={{ pointerEvents: "none" }}
            >
              {seat.key}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
