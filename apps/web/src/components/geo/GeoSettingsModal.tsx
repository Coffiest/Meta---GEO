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
