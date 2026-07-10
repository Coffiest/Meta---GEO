"use client";

import { motion } from "framer-motion";
import type { TreeNode } from "@/lib/geoApi";
import { bucketColor, bucketOrderIndex } from "./colors";

/**
 * GTO Wizard型の、位置タブそのものに埋め込むコンパクトなアクション選択リスト。
 * PositionActionRow(頻度%を大きく見せるタイル型)とは違い、ラベルだけを縦に積んだ
 * 小さいテキストボタン列にして、「頻度を見る」のではなく「アクションを選ぶ」ための
 * 軽量な操作にする。弱→強の固定順(Foldが上)で並べる。
 */
export function PositionActionList({
  node,
  bucketLabels,
  onSelect,
}: {
  node: TreeNode;
  bucketLabels: Record<string, string>;
  onSelect: (bucket: string) => void;
}) {
  if (node.position === null) {
    return <p className="text-[11px] text-navy-400 px-1">このラインではハンドが終了しています。</p>;
  }
  if (node.sampleSize === 0) {
    return <p className="text-[11px] text-navy-400 px-1">{node.position} — サンプルなし</p>;
  }

  const sortedOptions = [...node.options].sort((a, b) => bucketOrderIndex(a.bucket) - bucketOrderIndex(b.bucket));

  return (
    <div className="rounded-xl bg-navy-900 ring-1 ring-navy-700 overflow-hidden w-[168px]">
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-navy-950/60">
        <span className="text-[10px] font-bold tracking-wide text-navy-300">{node.position}</span>
        <span className="text-[9px] text-navy-500 tabular-nums">n={node.sampleSize}</span>
      </div>
      <div className="divide-y divide-navy-800">
        {sortedOptions.map((opt, i) => (
          <motion.button
            key={opt.bucket}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, delay: i * 0.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(opt.bucket)}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: bucketColor(opt.bucket, opt.geometricRatio) }} />
            <span className="text-[12px] font-semibold text-navy-50 truncate">{bucketLabels[opt.bucket] ?? opt.bucket}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
