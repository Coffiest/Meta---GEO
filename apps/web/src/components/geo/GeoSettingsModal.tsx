"use client";

import { motion } from "framer-motion";
import {
  STACK_BUCKETS,
  STACK_BUCKET_LABELS,
  GTO_STACKS,
  GTO_STACK_LABELS,
  BUBBLE_STAGES,
  BUBBLE_STAGE_LABELS,
  type StackBucket,
  type GtoStack,
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
      <div className="mb-2 flex items-center justify-between text-[12px] font-black tabular-nums text-navy-50">
        <span>{range.min.toFixed(0)}</span>
        <span className="text-[10px] font-bold text-navy-500">〜</span>
        <span>{range.max.toFixed(0)}</span>
      </div>
      <div className="relative h-6">
        {/* トラック(ダーク・ゴールドの選択帯) */}
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-navy-800" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-gold-500" style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }} />
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

/** 左上の設定ボタンから開く詳細設定モーダル。エフェクティブスタック・ICM・トナメ偏差値レンジを選ぶ。
 * GTOタブ(mode="gto")では実スタック深度(100/30/20/15/10/5 BB)を選び、GEO専用のICM/偏差値は非表示。 */
export function GeoSettingsModal({
  mode = "geo",
  stackBucket,
  gtoStackBb,
  bubbleStage,
  ratingRange,
  playerCount,
  gtoPlayerCount,
  onChangeStackBucket,
  onChangeGtoStackBb,
  onChangeBubbleStage,
  onChangeRatingRange,
  onChangePlayerCount,
  onChangeGtoPlayerCount,
  onClose,
}: {
  mode?: "geo" | "gto";
  stackBucket: StackBucket;
  gtoStackBb: GtoStack;
  bubbleStage: BubbleStage;
  ratingRange: { min: number; max: number };
  /** GEOタブの人数フィルタ。null=全人数(フィルタなし)。 */
  playerCount: number | null;
  /** GTOタブの人数(2〜6)。少人数はアーリーポジションの自動フォールドで表現する。 */
  gtoPlayerCount: number;
  onChangeStackBucket: (v: StackBucket) => void;
  onChangeGtoStackBb: (v: GtoStack) => void;
  onChangeBubbleStage: (v: BubbleStage) => void;
  onChangeRatingRange: (r: { min: number; max: number }) => void;
  onChangePlayerCount: (v: number | null) => void;
  onChangeGtoPlayerCount: (v: number) => void;
  onClose: () => void;
}) {
  const isGto = mode === "gto";
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
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-navy-700 bg-navy-900 p-4"
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-extrabold tracking-tight text-navy-50">詳細設定</p>
          <button onClick={onClose} className="text-navy-400 text-xs font-semibold">
            閉じる
          </button>
        </div>

        <div className={isGto ? "" : "mb-5"}>
          <p className="text-[11px] tracking-wide text-navy-400 uppercase font-bold mb-2">エフェクティブスタック</p>
          {isGto ? (
            <div className="flex flex-wrap gap-1.5">
              {GTO_STACKS.map((bb) => (
                <motion.button
                  key={bb}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => onChangeGtoStackBb(bb)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-bold tabular-nums transition-colors border ${
                    gtoStackBb === bb ? "bg-gold-500 text-navy-950 border-gold-500" : "bg-navy-950 text-navy-300 border-navy-700"
                  }`}
                >
                  {GTO_STACK_LABELS[bb]}
                </motion.button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {STACK_BUCKETS.map((bucket) => (
                <motion.button
                  key={bucket}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => onChangeStackBucket(bucket)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-bold tabular-nums transition-colors border ${
                    stackBucket === bucket ? "bg-gold-500 text-navy-950 border-gold-500" : "bg-navy-950 text-navy-300 border-navy-700"
                  }`}
                >
                  {STACK_BUCKET_LABELS[bucket]}
                </motion.button>
              ))}
            </div>
          )}
          {isGto && (
            <p className="mt-1.5 text-[10px] text-navy-500">選んだスタック深度のGTO混合戦略(RFI/ディフェンス/3bet)を表示します。</p>
          )}
        </div>

        {/* 人数(2〜6)。GEOは実測ハンドの参加人数フィルタ(全人数も選べる)、
            GTOは少人数卓(アーリーポジションがフォールド済みのツリー)の表示。 */}
        <div className={isGto ? "mt-5" : "mb-5"}>
          <p className="text-[11px] tracking-wide text-navy-400 uppercase font-bold mb-2">人数</p>
          <div className="flex flex-wrap gap-1.5">
            {!isGto && (
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => onChangePlayerCount(null)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors border ${
                  playerCount === null ? "bg-gold-500 text-navy-950 border-gold-500" : "bg-navy-950 text-navy-300 border-navy-700"
                }`}
              >
                全体
              </motion.button>
            )}
            {[2, 3, 4, 5, 6].map((n) => {
              const selected = isGto ? gtoPlayerCount === n : playerCount === n;
              return (
                <motion.button
                  key={n}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => (isGto ? onChangeGtoPlayerCount(n) : onChangePlayerCount(n))}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-bold tabular-nums transition-colors border ${
                    selected ? "bg-gold-500 text-navy-950 border-gold-500" : "bg-navy-950 text-navy-300 border-navy-700"
                  }`}
                >
                  {n}人
                </motion.button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-navy-500">
            {isGto
              ? "少人数はアーリーポジションがフォールドした局面のGTO戦略を表示します。"
              : "その人数でプレイされたハンドだけを集計します(変更するとラインはリセット)。"}
          </p>
        </div>

        {/* ICM・偏差値はGEO(実測DB)専用フィルタ。GTOタブでは非表示。 */}
        {!isGto && (
          <>
            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] tracking-wide text-navy-400 uppercase font-bold">トナメ偏差値レンジ</p>
                {(ratingRange.min > RATING_MIN || ratingRange.max < RATING_MAX) && (
                  <button
                    onClick={() => onChangeRatingRange({ min: RATING_MIN, max: RATING_MAX })}
                    className="text-[10px] font-bold text-navy-400 underline underline-offset-2"
                  >
                    全体に戻す
                  </button>
                )}
              </div>
              <RatingRangeSlider range={ratingRange} onChange={onChangeRatingRange} />
              <p className="mt-1.5 text-[10px] text-navy-500">この偏差値帯のプレイヤーの意思決定だけを集計します。</p>
            </div>

            <div>
              <p className="text-[11px] tracking-wide text-navy-400 uppercase font-bold mb-2">ICM設定(インマネまでの残り人数)</p>
              <div className="flex flex-wrap gap-1.5">
                {BUBBLE_STAGES.map((stage) => (
                  <motion.button
                    key={stage}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => onChangeBubbleStage(stage)}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors border ${
                      bubbleStage === stage ? "bg-gold-500 text-navy-950 border-gold-500" : "bg-navy-950 text-navy-300 border-navy-700"
                    }`}
                  >
                    {BUBBLE_STAGE_LABELS[stage]}
                  </motion.button>
                ))}
              </div>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
