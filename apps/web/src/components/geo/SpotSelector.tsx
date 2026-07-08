"use client";

import type { RangeScenario } from "@/lib/geoApi";

const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

const SCENARIOS: { key: RangeScenario; label: string }[] = [
  { key: "rfi", label: "オープンレイズ (RFI)" },
  { key: "vsOpen", label: "vs オープン" },
];

/** GTO Wizard風の「シナリオ→ポジション」スポット選択バー。 */
export function SpotSelector({
  position,
  scenario,
  onPositionChange,
  onScenarioChange,
}: {
  position: string;
  scenario: RangeScenario;
  onPositionChange: (p: string) => void;
  onScenarioChange: (s: RangeScenario) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex gap-1.5 rounded-full bg-ink-900/70 ring-1 ring-ink-700/50 p-1 w-fit">
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            onClick={() => onScenarioChange(s.key)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
              scenario === s.key ? "bg-gold-500 text-ink-950" : "text-ink-400 hover:text-ink-100"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {POSITIONS.map((p) => (
          <button
            key={p}
            onClick={() => onPositionChange(p)}
            className={`rounded-lg px-3.5 py-2 text-[12px] font-semibold tabular-nums transition-colors ring-1 ${
              position === p
                ? "bg-ink-100 text-ink-950 ring-ink-100"
                : "bg-ink-900/70 text-ink-300 ring-ink-700/50 hover:text-ink-100"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
