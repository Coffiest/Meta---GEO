"use client";

import {
  STACK_BUCKETS,
  STACK_BUCKET_LABELS,
  BUBBLE_STAGES,
  BUBBLE_STAGE_LABELS,
  type StackBucket,
  type BubbleStage,
} from "@/lib/geoApi";

/** 左上の設定ボタンから開く詳細設定モーダル。エフェクティブスタックとICM設定(インマネまでの残り人数)を選ぶ。 */
export function GeoSettingsModal({
  stackBucket,
  bubbleStage,
  onChangeStackBucket,
  onChangeBubbleStage,
  onClose,
}: {
  stackBucket: StackBucket;
  bubbleStage: BubbleStage;
  onChangeStackBucket: (v: StackBucket) => void;
  onChangeBubbleStage: (v: BubbleStage) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-navy-900 ring-1 ring-navy-700 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-navy-100">詳細設定</p>
          <button onClick={onClose} className="text-navy-400 text-xs">
            閉じる
          </button>
        </div>

        <div className="mb-5">
          <p className="text-[11px] tracking-wide text-navy-400 uppercase font-semibold mb-2">エフェクティブスタック</p>
          <div className="flex flex-wrap gap-1.5">
            {STACK_BUCKETS.map((bucket) => (
              <button
                key={bucket}
                onClick={() => onChangeStackBucket(bucket)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold tabular-nums transition-colors ${
                  stackBucket === bucket ? "bg-gold-500 text-navy-950" : "bg-navy-800 text-navy-300 ring-1 ring-navy-600/60"
                }`}
              >
                {STACK_BUCKET_LABELS[bucket]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] tracking-wide text-navy-400 uppercase font-semibold mb-2">ICM設定(インマネまでの残り人数)</p>
          <div className="flex flex-wrap gap-1.5">
            {BUBBLE_STAGES.map((stage) => (
              <button
                key={stage}
                onClick={() => onChangeBubbleStage(stage)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  bubbleStage === stage ? "bg-gold-500 text-navy-950" : "bg-navy-800 text-navy-300 ring-1 ring-navy-600/60"
                }`}
              >
                {BUBBLE_STAGE_LABELS[stage]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
