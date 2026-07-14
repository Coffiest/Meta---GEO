"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { TreeNode } from "@/lib/geoApi";
import { bucketColor, bucketOrderIndex } from "./colors";

/**
 * 現在のノード(次に手番が来るポジション)を、色分けされた頻度ボックスとして表示する。
 * タップするとそのバケットがラインに追加される。頻度順ではなく固定のアグレッション順
 * (強→弱、左から右。濃い色ほど左)で並べる。ジオメトリックサイズ以上のオプションは
 * 紫系の色で表示される(bucketColorがgeometricRatioを見て判定)。
 */
export function PositionActionRow({
  node,
  bucketLabels,
  onSelect,
}: {
  node: TreeNode;
  bucketLabels: Record<string, string>;
  onSelect: (bucket: string) => void;
}) {
  if (node.position === null) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-ink-200 bg-ink-50 p-6 text-center"
      >
        <p className="text-sm text-ink-600">このラインではハンドが終了しています(それ以上の意思決定なし)。</p>
      </motion.div>
    );
  }

  if (node.sampleSize === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-ink-200 bg-ink-50 p-6 text-center"
      >
        <p className="text-[11px] tracking-[0.2em] text-ink-500 uppercase mb-1 font-bold">{node.position}</p>
        <p className="text-sm text-ink-400">サンプルなし</p>
      </motion.div>
    );
  }

  const sortedOptions = [...node.options].sort((a, b) => bucketOrderIndex(b.bucket) - bucketOrderIndex(a.bucket));

  return (
    <motion.div
      key={node.position}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="rounded-2xl border border-ink-950 bg-white p-3"
    >
      <div className="flex items-center justify-between mb-2.5 px-1">
        <p className="text-[11px] tracking-[0.2em] text-ink-800 uppercase font-black">{node.position}</p>
        <p className="text-[10px] text-ink-400 tabular-nums">n={node.sampleSize}</p>
      </div>
      {/* 横スクロール1行(グリッドの折り返しに頼らない): 強→弱の順で並べているため、
          行が折り返されても崩れないよう、最も激しいアクションが常に一番左(スクロール起点)に
          来ることを保証する。 */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        <AnimatePresence mode="popLayout">
          {sortedOptions.map((opt, i) => (
            <motion.button
              key={opt.bucket}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: i * 0.03, ease: "easeOut" }}
              whileTap={{ scale: 0.94 }}
              onClick={() => onSelect(opt.bucket)}
              className="relative overflow-hidden rounded-xl p-2.5 text-left shrink-0 w-[104px]"
              style={{ background: bucketColor(opt.bucket, opt.geometricRatio) }}
            >
              <div className="text-[11px] font-bold text-white leading-tight">{bucketLabels[opt.bucket] ?? opt.bucket}</div>
              <div className="text-lg font-black text-white tabular-nums leading-tight mt-0.5">
                {Math.round(opt.frequency * 100)}%
              </div>
              <div className="text-[9px] text-white/70 tabular-nums">{opt.count}件</div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden mt-2.5">
        {sortedOptions.map((opt) => (
          <motion.div
            key={opt.bucket}
            initial={{ width: 0 }}
            animate={{ width: `${opt.frequency * 100}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{ background: bucketColor(opt.bucket, opt.geometricRatio) }}
          />
        ))}
      </div>
    </motion.div>
  );
}
