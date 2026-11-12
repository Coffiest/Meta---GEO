"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { TRAINER_POSITIONS, TRAINER_STACKS, type TrainerPosition, type TrainerStack } from "@/lib/trainer";
import { TrainerPlayer } from "./TrainerPlayer";

/**
 * 特訓(プリフロップの練習モード)。レッスンタブの中の「特訓」。
 * 8人卓・トーナメント・アンティあり。ソルバーの解と比べて採点し、得点と期待値の損を出す。
 */
export type TrainerSettings = {
  mode: "street";
  difficulty: "standard";
  /** 相手の行動の選び方。frequency=解の頻度どおり / top=いちばん多い行動。 */
  villain: "frequency" | "top";
  pause: "never" | "mistake" | "always";
  speed: "normal" | "fast" | "turbo";
  rng: "off" | "low" | "high";
  hands: number;
  stacks: TrainerStack[];
  positions: TrainerPosition[];
};

export const DEFAULT_TRAINER_SETTINGS: TrainerSettings = {
  mode: "street",
  difficulty: "standard",
  villain: "frequency",
  pause: "mistake",
  speed: "turbo",
  rng: "high",
  hands: 200,
  stacks: [...TRAINER_STACKS],
  positions: [...TRAINER_POSITIONS],
};

const KEY = "pokerart.trainer.settings.v1";

function loadSettings(): TrainerSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_TRAINER_SETTINGS, ...(JSON.parse(raw) as Partial<TrainerSettings>) };
  } catch {
    // 読めなければ既定値
  }
  return DEFAULT_TRAINER_SETTINGS;
}

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="shrink-0 text-[13px] font-bold text-fg-2">{label}</span>
      <div className="flex gap-1 rounded-xl bg-white/[0.05] p-0.5">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`pressable rounded-[10px] px-2.5 py-1.5 text-[12px] font-bold ${
              value === o.v ? "bg-accent text-on-accent" : "text-fg-2"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chips<T extends string | number>({
  label,
  all,
  value,
  onChange,
  fmt,
}: {
  label: string;
  all: readonly T[];
  value: T[];
  onChange: (v: T[]) => void;
  fmt: (v: T) => string;
}) {
  return (
    <div className="px-3 py-2.5">
      <span className="text-[13px] font-bold text-fg-2">{label}</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {all.map((v) => {
          const on = value.includes(v);
          return (
            <button
              key={String(v)}
              type="button"
              onClick={() => {
                const next = on ? value.filter((x) => x !== v) : [...value, v];
                if (next.length > 0) onChange(all.filter((x) => next.includes(x)));
              }}
              className={`pressable rounded-full px-3 py-1.5 text-[12px] font-bold tabular-nums ${
                on ? "bg-accent text-on-accent" : "bg-white/[0.05] text-fg-3"
              }`}
            >
              {fmt(v)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TrainerTab() {
  const [s, setS] = useState<TrainerSettings>(DEFAULT_TRAINER_SETTINGS);
  const [playing, setPlaying] = useState(false);
  useEffect(() => setS(loadSettings()), []);
  const update = (p: Partial<TrainerSettings>) => {
    const next = { ...s, ...p };
    setS(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // 保存できなくても続ける
    }
  };

  return (
    <div>
      <div className="glass-panel mb-4 rounded-3xl px-4 py-3.5">
        <p className="text-[16px] font-black tracking-tight text-fg">プリフロップ特訓</p>
        <p className="mt-1 text-[12px] leading-relaxed text-fg-2">
          8人卓のトーナメント(アンティあり)。ソルバーの解と比べて、1手ごとに判定し、得点と期待値の損を出す。
        </p>
      </div>

      <div className="mb-4 overflow-hidden rounded-2xl bg-surface shadow-e1 [&>*+*]:border-t [&>*+*]:border-white/[0.07]">
        <Segment label="ゲームモード" value={s.mode} options={[{ v: "street", label: "ストリート" }]} onChange={(v) => update({ mode: v })} />
        <Segment label="難易度" value={s.difficulty} options={[{ v: "standard", label: "スタンダード" }]} onChange={(v) => update({ difficulty: v })} />
        <Segment
          label="相手の行動"
          value={s.villain}
          options={[
            { v: "frequency", label: "頻度どおり" },
            { v: "top", label: "最多の行動" },
          ]}
          onChange={(v) => update({ villain: v })}
        />
        <Segment
          label="一時停止"
          value={s.pause}
          options={[
            { v: "never", label: "しない" },
            { v: "mistake", label: "ミス" },
            { v: "always", label: "毎回" },
          ]}
          onChange={(v) => update({ pause: v })}
        />
        <Segment
          label="ゲーム速度"
          value={s.speed}
          options={[
            { v: "normal", label: "普通" },
            { v: "fast", label: "速い" },
            { v: "turbo", label: "ターボ" },
          ]}
          onChange={(v) => update({ speed: v })}
        />
        <Segment
          label="乱数"
          value={s.rng}
          options={[
            { v: "off", label: "なし" },
            { v: "low", label: "低" },
            { v: "high", label: "高" },
          ]}
          onChange={(v) => update({ rng: v })}
        />
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-[13px] font-bold text-fg-2">ハンド数</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={2000}
            value={s.hands}
            onChange={(e) => update({ hands: Math.max(1, Math.min(2000, Number(e.target.value) || 200)) })}
            className="w-24 rounded-xl bg-white/[0.05] px-3 py-1.5 text-right text-[14px] font-bold tabular-nums text-fg outline-none"
          />
        </div>
        <Chips label="スタック(bb)" all={TRAINER_STACKS} value={s.stacks} onChange={(v) => update({ stacks: v })} fmt={(v) => `${v}`} />
        <Chips label="自分のポジション" all={TRAINER_POSITIONS} value={s.positions} onChange={(v) => update({ positions: v })} fmt={(v) => v} />
      </div>

      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="pressable-lg flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-black text-on-accent shadow-glow"
      >
        <Icon name="play" className="h-5 w-5" />
        特訓をはじめる
      </button>

      {playing && <TrainerPlayer settings={s} onClose={() => setPlaying(false)} />}
    </div>
  );
}
