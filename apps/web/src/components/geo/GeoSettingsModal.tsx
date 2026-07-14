"use client";

import { motion } from "framer-motion";
import {
  STACK_BUCKETS,
  STACK_BUCKET_LABELS,
  BUBBLE_STAGES,
  BUBBLE_STAGE_LABELS,
  type StackBucket,
  type BubbleStage,
} from "@/lib/geoApi";

/** トナメ偏差値フィルタの下限・上限(この範囲外はUIで選べない)。 */
export const RATING_MIN = 20;
export const RATING_MAX = 80;

/** 2つのつまみ(下限・上限)を1本のバー上でスライドできる偏差値レンジスライダー。 */
function RatingRangeSlider({
  range,
  onChange,
}: {
  range: { min: number; max: number };
  onChange: (r: { min: number; max: number }) => void;
}) {
  const span = RATING_MAX - RATING_MIN;
  const leftPct = ((range.min - RATING_MIN) / span) * 100;
  const rightPct = ((range.max - RATING_MIN) / span) * 100;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[12px] font-black tabular-nums text-ink-950">
        <span>{range.min.toFixed(0)}</span>
        <span className="text-[10px] font-bold text-ink-400">〜</span>
        <span>{range.max.toFixed(0)}</span>
      </div>
      <div className="relative h-6">
        {/* トラック(黒枠線・非シェーディング) */}
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink-200" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink-950" style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }} />
        <input
          type="range"
          min={RATING_MIN}
          max={RATING_MAX}
          step={1}
          value={range.min}
          onChange={(e) => onChange({ min: Math.min(Number(e.target.value), range.max - 1), max: range.max })}
          className="geo-range absolute inset-x-0 top-0 h-6 w-full"
          aria-label="偏差値の下限"
        />
        <input
          type="range"
          min={RATING_MIN}
          max={RATING_MAX}
          step={1}
          value={range.max}
          onChange={(e) => onChange({ min: range.min, max: Math.max(Number(e.target.value), range.min + 1) })}
          className="geo-range absolute inset-x-0 top-0 h-6 w-full"
          aria-label="偏差値の上限"
        />
      </div>
    </div>
  );
}

/** 左上の設定ボタンから開く詳細設定モーダル。エフェクティブスタック・ICM・トナメ偏差値レンジを選ぶ。 */
export function GeoSettingsModal({
  stackBucket,
  bubbleStage,
  ratingRange,
  onChangeStackBucket,
  onChangeBubbleStage,
  onChangeRatingRange,
  onClose,
}: {
  stackBucket: StackBucket;
  bubbleStage: BubbleStage;
  ratingRange: { min: number; max: number };
  onChangeStackBucket: (v: StackBucket) => void;
  onChangeBubbleStage: (v: BubbleStage) => void;
  onChangeRatingRange: (r: { min: number; max: number }) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-ink-950 bg-white p-4"
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-extrabold tracking-tight text-ink-950">詳細設定</p>
          <button onClick={onClose} className="text-ink-500 text-xs font-semibold">
            閉じる
          </button>
        </div>

        <div className="mb-5">
          <p className="text-[11px] tracking-wide text-ink-500 uppercase font-bold mb-2">エフェクティブスタック</p>
          <div className="flex flex-wrap gap-1.5">
            {STACK_BUCKETS.map((bucket) => (
              <motion.button
                key={bucket}
                whileTap={{ scale: 0.94 }}
                onClick={() => onChangeStackBucket(bucket)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-bold tabular-nums transition-colors border ${
                  stackBucket === bucket ? "bg-ink-950 text-white border-ink-950" : "bg-white text-ink-700 border-ink-300"
                }`}
              >
                {STACK_BUCKET_LABELS[bucket]}
              </motion.button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] tracking-wide text-ink-500 uppercase font-bold">トナメ偏差値レンジ</p>
            {(ratingRange.min > RATING_MIN || ratingRange.max < RATING_MAX) && (
              <button
                onClick={() => onChangeRatingRange({ min: RATING_MIN, max: RATING_MAX })}
                className="text-[10px] font-bold text-ink-400 underline underline-offset-2"
              >
                全体に戻す
              </button>
            )}
          </div>
          <RatingRangeSlider range={ratingRange} onChange={onChangeRatingRange} />
          <p className="mt-1.5 text-[10px] text-ink-400">この偏差値帯のプレイヤーの意思決定だけを集計します。</p>
        </div>

        <div>
          <p className="text-[11px] tracking-wide text-ink-500 uppercase font-bold mb-2">ICM設定(インマネまでの残り人数)</p>
          <div className="flex flex-wrap gap-1.5">
            {BUBBLE_STAGES.map((stage) => (
              <motion.button
                key={stage}
                whileTap={{ scale: 0.94 }}
                onClick={() => onChangeBubbleStage(stage)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors border ${
                  bubbleStage === stage ? "bg-ink-950 text-white border-ink-950" : "bg-white text-ink-700 border-ink-300"
                }`}
              >
                {BUBBLE_STAGE_LABELS[stage]}
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
