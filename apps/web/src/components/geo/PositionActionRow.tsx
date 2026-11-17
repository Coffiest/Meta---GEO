"use client";

import { mergeOpenRaiseOptions, type TreeNode } from "@/lib/geoApi";
import { bucketColor, bucketOrderIndex } from "./colors";

/**
 * 手番の人の行動の板(GTO タブ・GTO Wizard と同じ作り)。不透明の色の板に、左上に行動、左下に頻度、右下に件数。
 * 下に全体の割合の帯。見るためのもので押せない(行動は上の席の帯で選ぶ)。
 * 並びは強い行動が左(オールイン → レイズ → コール → フォールド)。
 */
export function PositionActionRow({
  node,
  bucketLabels,
}: {
  node: TreeNode;
  bucketLabels: Record<string, string>;
  onSelect?: (bucket: string) => void;
}) {
  if (node.position === null) {
    return (
      <div className="rounded-xl bg-[#1b1b1d] p-6 text-center">
        <p className="text-sm text-[#cfcfcf]">このラインではハンドが終了しています(それ以上の意思決定なし)。</p>
      </div>
    );
  }
  if (node.sampleSize === 0) {
    return (
      <div className="rounded-xl bg-[#1b1b1d] p-6 text-center">
        <p className="mb-1 text-[12px] font-black text-[#cfcfcf]">{node.position}</p>
        <p className="text-sm text-[#9a9a9a]">サンプルなし</p>
      </div>
    );
  }
  const opts = mergeOpenRaiseOptions(node.options).sort((a, b) => bucketOrderIndex(b.bucket) - bucketOrderIndex(a.bucket));
  const many = opts.length > 3;
  return (
    <div className="rounded-xl bg-[#1b1b1d] p-1">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${opts.length}, minmax(0, 1fr))` }}>
        {opts.map((o) => (
          <div
            key={o.bucket}
            className="flex h-[104px] flex-col justify-between rounded-lg p-2 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]"
            style={{ background: bucketColor(o.representativeBucket ?? o.bucket) }}
          >
            <span className={`truncate font-bold leading-tight ${many ? "text-[14px] sm:text-[17px]" : "text-[17px]"}`}>
              {bucketLabels[o.bucket] ?? o.bucket}
            </span>
            <span className="flex items-end justify-between gap-1">
              <span className={`font-bold leading-none tabular-nums ${many ? "text-[17px] sm:text-[22px]" : "text-[22px]"}`}>
                {+(o.frequency * 100).toFixed(1)}%
              </span>
              <span className={`text-right text-[10px] leading-tight tabular-nums opacity-90 ${many ? "hidden sm:inline" : ""}`}>
                {node.isGto && o.evBb !== undefined ? (
                  <>
                    EV
                    <br />
                    {o.evBb.toFixed(2)}
                  </>
                ) : (
                  <>
                    {o.count.toLocaleString()}
                    <br />
                    件
                  </>
                )}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex h-4 overflow-hidden rounded-md">
        {opts.map((o) => (
          <span key={o.bucket} style={{ width: `${o.frequency * 100}%`, background: bucketColor(o.representativeBucket ?? o.bucket) }} />
        ))}
      </div>
    </div>
  );
}
