"use client";

import { BUBBLE_STAGES, BUBBLE_STAGE_LABELS, type BubbleStage } from "@/lib/geoApi";

export function BubbleStageSelector({ value, onChange }: { value: BubbleStage; onChange: (v: BubbleStage) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
      {BUBBLE_STAGES.map((stage) => (
        <button
          key={stage}
          onClick={() => onChange(stage)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
            value === stage ? "bg-gold-500 text-navy-950" : "bg-navy-800 text-navy-300 ring-1 ring-navy-600/60"
          }`}
        >
          {BUBBLE_STAGE_LABELS[stage]}
        </button>
      ))}
    </div>
  );
}
