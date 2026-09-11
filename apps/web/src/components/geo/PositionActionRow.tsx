"use client";

import { AnimatePresence, motion } from "framer-motion";
import { mergeOpenRaiseOptions, type TreeNode } from "@/lib/geoApi";
import { bucketColor, bucketOrderIndex, bucketTextColor } from "./colors";

/**
 * 現在のノード(次に手番が来るポジション)を、色分けされた頻度ボックスとして表示する。
 * タップするとそのバケットがラインに追加される。頻度順ではなく固定のアグレッション順
 * (強→弱、左から右)で並べる。色は固定4色(Fold=青/Call=緑/Bet・Raise=赤/
 * とても大きいBet・Raise・Allin=茶)。
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
        className="rounded-2xl border border-line bg-canvas p-6 text-center"
      >
        <p className="text-sm text-n-9">このラインではハンドが終了しています(それ以上の意思決定なし)。</p>
      </motion.div>
    );
  }

  if (node.sampleSize === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-line bg-canvas p-6 text-center"
      >
        <p className="text-[11px] tracking-[0.2em] text-fg-2 uppercase mb-1 font-bold">{node.position}</p>
        <p className="text-sm text-fg-3">サンプルなし</p>
      </motion.div>
    );
  }

  const sortedOptions = mergeOpenRaiseOptions(node.options).sort(
    (a, b) => bucketOrderIndex(b.bucket) - bucketOrderIndex(a.bucket),
  );

  return (
    <motion.div
      key={node.position}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="rounded-2xl glass-panel p-3"
    >
      <div className="flex items-center justify-between mb-2.5 px-1">
        <p className="text-[11px] tracking-[0.2em] text-n-10 uppercase font-black">{node.position}</p>
        {node.isGto ? (
          <p className="text-[10px] text-accent tabular-nums font-black tracking-[0.15em]">GTO</p>
        ) : (
          <p className="text-[10px] text-fg-3 tabular-nums">n={node.sampleSize}</p>
        )}
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
              onClick={() => onSelect(opt.representativeBucket ?? opt.bucket)}
              className="pressable relative w-[104px] shrink-0 overflow-hidden rounded-xl p-2.5 text-left shadow-e1"
              style={{
                background: bucketColor(opt.representativeBucket ?? opt.bucket),
                // 面が明るいほど白文字が読めなくなるので、文字色は面の明るさから選び直す。
                color: bucketTextColor(bucketColor(opt.representativeBucket ?? opt.bucket)),
              }}
            >
              <div className="text-[11px] font-bold leading-tight">{bucketLabels[opt.bucket] ?? opt.bucket}</div>
              <div className="mt-0.5 text-lg font-black leading-tight tabular-nums">
                {Math.round(opt.frequency * 100)}%
              </div>
              {node.isGto ? (
                opt.evBb !== undefined && opt.evBb !== 0 ? (
                  <div className="text-[9px] tabular-nums opacity-75">
                    EV {opt.evBb >= 0 ? "+" : ""}
                    {opt.evBb.toFixed(2)}bb
                  </div>
                ) : (
                  <div className="text-[9px] tabular-nums opacity-40">&nbsp;</div>
                )
              ) : (
                <div className="text-[9px] tabular-nums opacity-75">{opt.count}件</div>
              )}
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
            style={{ background: bucketColor(opt.representativeBucket ?? opt.bucket) }}
          />
        ))}
      </div>
    </motion.div>
  );
}
