"use client";

import {
  mergeOpenRaiseByBucket,
  mergeOpenRaiseOptions,
  OPEN_RAISE_BUCKET,
  type HandClassCell,
  type MergedActionOption,
  type TreeNode,
} from "@/lib/geoApi";
import { bucketColor, bucketOrderIndex, bucketTextColor } from "./colors";

/**
 * PC(lg以上)専用の右ペイン。GTO Wizard の Study 画面の右側を写したもの(上から順に):
 *
 * 1. 見出し: 手番のポジションと、このノードの件数
 * 2. アクション表: アクションごとのタイル。タイル全体をアクション色で塗り、左上にラベル、
 *    左下に頻度(大)、右下に件数。押すとそのアクションで次の手番へ進む
 * 3. 全体の頻度を横に積んだバー
 * 4. 手札パネル: レンジ表のセルにカーソルを合わせている間はその手札の内訳、
 *    外れている間はこのノード全体の内訳(表)
 */
export function DesktopStudyPanel({
  node,
  mergeOpenRaise,
  bucketLabels,
  hoveredCell,
  onSelect,
}: {
  node: TreeNode | null;
  mergeOpenRaise: boolean;
  bucketLabels: Record<string, string>;
  hoveredCell: HandClassCell | null;
  onSelect: (bucket: string) => void;
}) {
  if (!node) return null;
  if (node.position === null) {
    return (
      <section className="rounded-lg bg-surface p-5 shadow-e1">
        <p className="text-[13px] text-fg-2">このラインではハンドが終了しています(それ以上の意思決定なし)。</p>
      </section>
    );
  }

  const options: MergedActionOption[] = (mergeOpenRaise ? mergeOpenRaiseOptions(node.options) : node.options)
    .slice()
    .sort((a, b) => bucketOrderIndex(b.bucket) - bucketOrderIndex(a.bucket));

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-lg bg-surface p-3 shadow-e1" aria-label="アクション">
        <div className="mb-2.5 flex items-baseline justify-between px-0.5">
          <p className="text-[13px] font-black tracking-[0.04em] text-fg">
            {node.position}
            <span className="ml-2 text-[11px] font-semibold text-fg-3">の戦略</span>
          </p>
          <p className="text-[11px] font-semibold tabular-nums text-fg-3">
            {node.isGto ? "GTO" : `n=${node.sampleSize.toLocaleString()}`}
          </p>
        </div>

        {node.sampleSize === 0 ? (
          <p className="py-6 text-center text-[13px] text-fg-3">サンプルなし</p>
        ) : (
          <>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, minmax(0, 1fr))` }}>
              {options.map((opt) => {
                const bucket = opt.representativeBucket ?? opt.bucket;
                const color = bucketColor(bucket);
                return (
                  <button
                    key={opt.bucket}
                    type="button"
                    onClick={() => onSelect(bucket)}
                    className="pressable flex h-[76px] flex-col justify-between rounded-md p-2 text-left"
                    style={{ background: color, color: bucketTextColor(color) }}
                  >
                    <span className="truncate text-[12px] font-black">{bucketLabels[opt.bucket] ?? opt.bucket}</span>
                    <span className="flex items-end justify-between gap-1">
                      <span className="text-[22px] font-black leading-none tabular-nums">
                        {(opt.frequency * 100).toFixed(1)}
                        <span className="ml-0.5 text-[11px]">%</span>
                      </span>
                      <span className="text-[10px] font-bold tabular-nums opacity-85">
                        {node.isGto && opt.evBb !== undefined ? `EV ${opt.evBb.toFixed(2)}` : `${opt.count.toLocaleString()}件`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex h-[18px] overflow-hidden rounded bg-canvas-sunken">
              {options.map((opt) => (
                <div
                  key={opt.bucket}
                  style={{ width: `${opt.frequency * 100}%`, background: bucketColor(opt.representativeBucket ?? opt.bucket) }}
                  title={`${bucketLabels[opt.bucket] ?? opt.bucket} ${(opt.frequency * 100).toFixed(1)}%`}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <HandPanel
        node={node}
        options={options}
        mergeOpenRaise={mergeOpenRaise}
        bucketLabels={bucketLabels}
        hoveredCell={hoveredCell}
      />
    </div>
  );
}

function HandPanel({
  node,
  options,
  mergeOpenRaise,
  bucketLabels,
  hoveredCell,
}: {
  node: TreeNode;
  options: MergedActionOption[];
  mergeOpenRaise: boolean;
  bucketLabels: Record<string, string>;
  hoveredCell: HandClassCell | null;
}) {
  if (hoveredCell) {
    const merged = mergeOpenRaise ? mergeOpenRaiseByBucket(hoveredCell.byBucket) : { byBucket: hoveredCell.byBucket };
    const rep = "openRaiseRepresentative" in merged ? merged.openRaiseRepresentative : undefined;
    const rows = Object.entries(merged.byBucket)
      .filter(([, n]) => n > 0)
      .sort((a, b) => bucketOrderIndex(b[0]) - bucketOrderIndex(a[0]));
    return (
      <section className="rounded-lg bg-surface p-3 shadow-e1" aria-label="手札の内訳">
        <div className="mb-2 flex items-baseline justify-between px-0.5">
          <p className="text-[20px] font-black text-fg">{hoveredCell.label}</p>
          <p className="text-[11px] font-semibold tabular-nums text-fg-3">{hoveredCell.count.toLocaleString()}件</p>
        </div>
        {hoveredCell.count === 0 ? (
          <p className="py-4 text-center text-[13px] text-fg-3">サンプルなし</p>
        ) : (
          <>
            <div className="mb-3 flex h-12 overflow-hidden rounded-md">
              {rows.map(([bucket, n]) => (
                <div
                  key={bucket}
                  style={{
                    width: `${(n / hoveredCell.count) * 100}%`,
                    background: bucketColor(bucket === OPEN_RAISE_BUCKET ? rep ?? bucket : bucket),
                  }}
                />
              ))}
            </div>
            <ul className="space-y-1">
              {rows.map(([bucket, n]) => (
                <li key={bucket} className="flex items-center gap-2 text-[12px]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: bucketColor(bucket === OPEN_RAISE_BUCKET ? rep ?? bucket : bucket) }}
                  />
                  <span className="flex-1 truncate font-bold text-fg">{bucketLabels[bucket] ?? bucket}</span>
                  <span className="w-16 text-right font-black tabular-nums text-fg">{((n / hoveredCell.count) * 100).toFixed(1)}%</span>
                  <span className="w-14 text-right tabular-nums text-fg-3">{n.toLocaleString()}件</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-lg bg-surface p-3 shadow-e1" aria-label="全体の内訳">
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <p className="shrink-0 text-[12px] font-black tracking-[0.06em] text-fg-2">内訳</p>
        <p className="ml-3 text-right text-[11px] text-fg-3">セルにカーソルを合わせると、その手札の内訳を表示</p>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[10px] font-black tracking-[0.06em] text-fg-3">
            <th className="pb-1.5 font-black">アクション</th>
            <th className="pb-1.5 text-right font-black">頻度</th>
            <th className="pb-1.5 text-right font-black">件数</th>
          </tr>
        </thead>
        <tbody>
          {options.map((opt) => (
            <tr key={opt.bucket} className="border-t border-line">
              <td className="py-1.5">
                <span className="flex items-center gap-2 font-bold text-fg">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: bucketColor(opt.representativeBucket ?? opt.bucket) }}
                  />
                  {bucketLabels[opt.bucket] ?? opt.bucket}
                </span>
              </td>
              <td className="py-1.5 text-right font-black tabular-nums text-fg">{(opt.frequency * 100).toFixed(1)}%</td>
              <td className="py-1.5 text-right tabular-nums text-fg-2">{opt.count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
