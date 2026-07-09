"use client";

import type { LineStep, TreeNode } from "@/lib/geoApi";
import { bucketColor } from "./colors";

/** ラインの確定済みステップをパンくず表示する。タップでその地点まで巻き戻せる。 */
export function LineBreadcrumb({
  line,
  bucketLabels,
  onTruncate,
}: {
  line: LineStep[];
  bucketLabels: Record<string, string>;
  onTruncate: (length: number) => void;
}) {
  if (line.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {line.map((step, i) => (
        <button
          key={i}
          onClick={() => onTruncate(i)}
          className="flex items-center gap-1 rounded-full bg-navy-800 px-2.5 py-1 text-[11px] ring-1 ring-navy-600/60"
          style={{ color: bucketColor(step.bucket) }}
        >
          <span className="text-navy-300">{step.position}</span>
          <span className="font-semibold">{bucketLabels[step.bucket] ?? step.bucket}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * 現在のノード(次に手番が来るポジション)を、色分けされた頻度バーとして表示する。
 * GTO Wizardの "Actions" パネル(Allin/Raise/Fold等の色付きボックス)に相当。
 * タップするとそのバケットがラインに追加される。
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
      <div className="rounded-2xl bg-navy-900 ring-1 ring-navy-700 p-6 text-center">
        <p className="text-sm text-navy-300">このラインではハンドが終了しています(それ以上の意思決定なし)。</p>
      </div>
    );
  }

  if (node.sampleSize === 0) {
    return (
      <div className="rounded-2xl bg-navy-900 ring-1 ring-navy-700 p-6 text-center">
        <p className="text-[11px] tracking-[0.2em] text-navy-500 uppercase mb-1">{node.position}</p>
        <p className="text-sm text-navy-400">サンプルなし</p>
      </div>
    );
  }

  const sortedOptions = [...node.options].sort((a, b) => b.frequency - a.frequency);

  return (
    <div className="rounded-2xl bg-navy-900 ring-1 ring-navy-700 p-3">
      <div className="flex items-center justify-between mb-2.5 px-1">
        <p className="text-[11px] tracking-[0.2em] text-navy-400 uppercase font-semibold">{node.position}</p>
        <p className="text-[10px] text-navy-500 tabular-nums">n={node.sampleSize}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {sortedOptions.map((opt) => (
          <button
            key={opt.bucket}
            onClick={() => onSelect(opt.bucket)}
            className="relative overflow-hidden rounded-xl p-2.5 text-left active:scale-[0.97] transition-transform"
            style={{ background: bucketColor(opt.bucket) }}
          >
            {opt.geometricRatio > 0.3 && (
              <span className="absolute top-1 right-1 rounded-full bg-black/30 px-1.5 py-0.5 text-[8px] font-bold text-white/90">
                Geo
              </span>
            )}
            <div className="text-[11px] font-bold text-white leading-tight">{bucketLabels[opt.bucket] ?? opt.bucket}</div>
            <div className="text-lg font-black text-white tabular-nums leading-tight mt-0.5">
              {Math.round(opt.frequency * 100)}%
            </div>
            <div className="text-[9px] text-white/70 tabular-nums">{opt.count}件</div>
          </button>
        ))}
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden mt-2.5">
        {sortedOptions.map((opt) => (
          <div key={opt.bucket} style={{ width: `${opt.frequency * 100}%`, background: bucketColor(opt.bucket) }} />
        ))}
      </div>
    </div>
  );
}
