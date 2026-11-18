"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { mergeOpenRaiseByBucket, mergeOpenRaiseOptions, OPEN_RAISE_BUCKET, type HandClassMatrixResult, type TreeNode } from "@/lib/geoApi";
import { handName } from "@/lib/trainer";
import { bucketColor, bucketOrderIndex } from "./colors";
import {
  CardChip,
  combosN,
  combosOf,
  curve,
  FiltersView,
  loadEquity,
  matchFilter,
  PanelTabs,
  rangeEquity,
  type HandFilter,
} from "./GtowExplorer";
import type { PillBarItem, Street } from "./PositionPillBar";

/**
 * GEO タブ(実際のプレイの集計)を、GTO タブと同じ作り・同じ使い方で出す。
 * 上: 席の帯(席ごとの板に行動を並べ、押して進める)。左: 手の表。右: Overview / Actions / Hands・Summary・Filters・Blockers。
 * GEO の集計には席の残りスタック・EV・相手のレンジが無いので、そこは「—」や説明にする。
 */

/** 席の帯。GTO タブの席の板と同じ見た目。 */
export function GeoSeatCards({
  items,
  node,
  bucketLabels,
  onSelect,
  onTruncate,
  onJump,
  lead,
}: {
  /** 帯の先頭に置く、設定の板(GTO タブの「MTT 100bb / ChipEV / ポット」と同じ位置)。 */
  lead?: ReactNode;
  items: PillBarItem[];
  node: TreeNode | null;
  bucketLabels: Record<string, string>;
  onSelect: (bucket: string) => void;
  onTruncate: (street: Street, lineIndex: number) => void;
  onJump?: (position: string) => void;
}) {
  const opts = node?.position
    ? mergeOpenRaiseOptions(node.options).sort((a, b) => bucketOrderIndex(b.bucket) - bucketOrderIndex(a.bucket))
    : [];
  const label = (b: string) => bucketLabels[b] ?? b;
  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto no-scrollbar rounded-xl bg-[#1b1b1d] p-1">
      {lead}
      {items.map((item, i) =>
        item.kind === "street" ? (
          <div key={`s${i}`} className="flex shrink-0 items-center gap-1 rounded-lg bg-[#252528] px-2 py-1.5">
            <span className="text-[11px] font-black text-[#cfcfcf]">{item.street.toUpperCase()}</span>
            {item.cards.map((c) => (
              <CardChip key={c} c={c} />
            ))}
          </div>
        ) : (
          <div
            key={`${item.street}-${item.position}-${i}`}
            className={`flex min-w-[96px] shrink-0 flex-col rounded-lg bg-[#252528] px-2 py-1.5 ${item.state === "active" ? "ring-2 ring-[#8fe388]" : ""}`}
          >
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className={`text-[13px] font-black ${item.state === "active" ? "text-[#8fe388]" : "text-[#cfcfcf]"}`}>{item.position}</span>
              <span className={`text-[12px] font-bold ${item.state === "active" ? "text-[#8fe388]" : "text-[#9a9a9a]"}`}>—</span>
            </div>
            {item.state === "active" ? (
              opts.length === 0 ? (
                <span className="text-[13px] text-[#8a8a8a]">{node?.sampleSize === 0 ? "サンプルなし" : "…"}</span>
              ) : (
                opts.map((o) => (
                  <button
                    key={o.bucket}
                    type="button"
                    onClick={() => onSelect(o.representativeBucket ?? o.bucket)}
                    className="pressable rounded px-0.5 text-left text-[13px] leading-[1.45] text-[#e6e6e6]"
                  >
                    {label(o.bucket)}
                  </button>
                ))
              )
            ) : item.state === "decided" ? (
              <button
                type="button"
                onClick={() => item.lineIndex !== undefined && onTruncate(item.street, item.lineIndex)}
                className="pressable rounded px-0.5 text-left text-[13px] font-bold leading-[1.45] text-white"
              >
                {item.actionLabel}
              </button>
            ) : (
              // まだ手番の来ていない席: GTO タブと同じく選べる行動を薄く並べ、押すとその席まで進める(手前の席はフォールド)。
              (opts.length ? opts.map((o) => o.bucket) : ["fold"]).map((b) => (
                <button
                  key={b}
                  type="button"
                  disabled={!(item.jumpable && onJump)}
                  onClick={() => onJump?.(item.position)}
                  className="pressable rounded px-0.5 text-left text-[13px] leading-[1.45] text-[#8a8a8a] disabled:cursor-default"
                >
                  {label(b)}
                </button>
              ))
            )}
          </div>
        ),
      )}
    </div>
  );
}

type Part = { bucket: string; color: string; frac: number; count: number };

/** 表・右側の板・内訳(GTO タブと同じ並び)。 */
export function GeoSolutionPanels({
  node,
  matrix,
  bucketLabels,
  mergeOpenRaise,
  positions,
}: {
  node: TreeNode | null;
  matrix: HandClassMatrixResult | null;
  bucketLabels: Record<string, string>;
  mergeOpenRaise: boolean;
  positions: string[];
}) {
  const [hand, setHand] = useState(0);
  const [topTab, setTopTab] = useState("Overview");
  const [tab, setTab] = useState("Hands");
  const [filter, setFilter] = useState<HandFilter>("all");
  const [eq, setEq] = useState<number[][] | null>(null);
  useEffect(() => {
    void loadEquity().then(setEq);
  }, []);
  const label = (b: string) => bucketLabels[b] ?? b;

  const cells = matrix?.cells.flat() ?? [];
  const partsOf = (byBucket: Record<string, number>): Part[] => {
    const m = mergeOpenRaise ? mergeOpenRaiseByBucket(byBucket) : { byBucket };
    const rep = "openRaiseRepresentative" in m ? m.openRaiseRepresentative : undefined;
    const total = Object.values(m.byBucket).reduce((a, b) => a + b, 0);
    return Object.entries(m.byBucket)
      .filter(([, v]) => v > 0)
      .sort((a, b) => bucketOrderIndex(b[0]) - bucketOrderIndex(a[0]))
      .map(([b, v]) => ({ bucket: b, color: bucketColor(b === OPEN_RAISE_BUCKET && rep ? rep : b), frac: total > 0 ? v / total : 0, count: v }));
  };
  const opts = node?.position
    ? mergeOpenRaiseOptions(node.options).sort((a, b) => bucketOrderIndex(b.bucket) - bucketOrderIndex(a.bucket))
    : [];
  const many = opts.length > 3;
  // レンジの重み(手ごとのサンプル数 ÷ コンボ数を、いちばん多い手で割る)。
  const dens = cells.map((c, h) => c.count / combosN(h));
  const maxDen = Math.max(1e-9, ...dens);
  const weight = dens.map((d) => d / maxDen);
  const sel = cells[hand];
  const selParts = sel ? partsOf(sel.byBucket) : [];
  const topPart = selParts.reduce<Part | null>((b, p) => (!b || p.frac > b.frac ? p : b), null);

  return (
    <div className="grid gap-3 grid-cols-[minmax(0,1fr)] [grid-template-areas:'m'_'d'_'t'] lg:items-start lg:gap-4 lg:[grid-template-areas:'m_t'_'m_d'] lg:grid-cols-[minmax(0,1fr)_minmax(380px,520px)] lg:grid-rows-[auto_1fr]">
      {/* 右上: Overview / Table / Equity chart と Actions */}
      <div style={{ gridArea: "t" }}>
        <PanelTabs tabs={["Overview", "Table", "Equity chart"]} active={topTab} onPick={setTopTab} />
        {topTab === "Equity chart" ? (
          <GeoEquity eq={eq} weight={weight} name={node?.position ?? ""} />
        ) : (
          <div className="mb-2 flex gap-1 overflow-x-auto rounded-b-xl rounded-tr-xl bg-[#1b1b1d] p-1">
            {positions.map((p) => (
              <div
                key={p}
                className={`flex min-w-[44px] flex-1 flex-col items-center rounded-md bg-[#252528] px-1 py-1 text-[12px] font-bold leading-tight ${
                  p === node?.position ? "text-[#8fe388]" : "text-[#e6e6e6]"
                }`}
              >
                <span>{p}</span>
                <span>{topTab === "Table" ? (p === node?.position ? "手番" : "") || "—" : "—"}</span>
              </div>
            ))}
            <div className="flex shrink-0 flex-col justify-center px-1.5 text-[11px] leading-tight tabular-nums">
              <span className="font-bold text-[#e6e6e6]">n={node?.sampleSize.toLocaleString() ?? 0}</span>
              <span className="text-[#9a9a9a]">サンプル</span>
            </div>
          </div>
        )}
        <PanelTabs tabs={["Actions"]} active="Actions" />
        <div className="rounded-b-xl rounded-tr-xl bg-[#1b1b1d] p-1">
          {opts.length === 0 ? (
            <p className="p-4 text-center text-[13px] text-[#9a9a9a]">
              {node?.position === null ? "このラインではハンドが終了しています。" : node?.sampleSize === 0 ? "サンプルなし" : "…"}
            </p>
          ) : (
            <>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${opts.length}, minmax(0, 1fr))` }}>
                {opts.map((o) => (
                  <div
                    key={o.bucket}
                    className="flex h-[104px] flex-col justify-between rounded-lg p-2 text-left text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]"
                    style={{ background: bucketColor(o.representativeBucket ?? o.bucket) }}
                  >
                    <span className={`truncate font-bold leading-tight ${many ? "text-[14px] sm:text-[17px]" : "text-[17px]"}`}>{label(o.bucket)}</span>
                    <span className="flex items-end justify-between gap-1">
                      <span className={`font-bold leading-none tabular-nums ${many ? "text-[17px] sm:text-[22px]" : "text-[22px]"}`}>
                        {+(o.frequency * 100).toFixed(1)}%
                      </span>
                      <span className={`text-right text-[10px] leading-tight tabular-nums opacity-90 ${many ? "hidden sm:inline" : ""}`}>
                        {o.count.toLocaleString()}
                        <br />件
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
            </>
          )}
        </div>
      </div>

      {/* 左: 手の表 */}
      <div style={{ gridArea: "m" }} className="lg:rounded-xl lg:bg-[#1b1b1d] lg:p-2">
        <div className="mx-auto grid w-full gap-[2px] lg:max-w-[calc(100dvh-300px)]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
          {cells.map((c, h) => {
            const parts = partsOf(c.byBucket);
            return (
              <button
                key={h}
                type="button"
                onClick={() => setHand(h)}
                className={`relative aspect-square overflow-hidden rounded-[2px] bg-[#2a2a2d] ${hand === h ? "ring-2 ring-white" : ""}`}
                style={{ opacity: c.count <= 0 || !matchFilter(h, filter) ? 0.25 : 1 }}
              >
                <span className="absolute inset-0 flex">
                  {parts.map((p) => (
                    <span key={p.bucket} style={{ width: `${p.frac * 100}%`, background: p.color }} />
                  ))}
                </span>
                <span className="absolute left-[6%] top-[4%] text-[clamp(7px,2.2vw,11px)] font-medium text-white lg:text-[clamp(9px,0.9vw,15px)] [text-shadow:0_1px_1px_rgba(0,0,0,0.4)]">
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 右下: Hands / Summary / Filters / Blockers */}
      <div style={{ gridArea: "d" }}>
        <PanelTabs tabs={["Hands", "Summary", "Filters", "Blockers"]} active={tab} onPick={setTab} />
        <div className="rounded-b-xl rounded-tr-xl bg-[#1b1b1d] p-1">
          {tab === "Filters" ? (
            <FiltersView filter={filter} setFilter={setFilter} />
          ) : tab === "Blockers" ? (
            <p className="p-3 text-[13px] leading-relaxed text-[#cfcfcf]">
              GEO の集計は実際のプレイの数なので、相手のレンジを持たない。そのためブロッカーは出せない。GTO タブで見られる。
            </p>
          ) : tab === "Summary" ? (
            <div className="p-2">
              <p className="mb-1.5 text-[14px] font-black text-white">
                {sel ? handName(hand) : "—"}
                <span className="ml-2 text-[11px] font-bold text-[#9a9a9a]">{(sel?.count ?? 0).toLocaleString()}件</span>
              </p>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-[13px] tabular-nums">
                <span className="text-[11px] text-[#9a9a9a]">行動</span>
                <span className="text-right text-[11px] text-[#9a9a9a]">割合</span>
                <span className="text-right text-[11px] text-[#9a9a9a]">件数</span>
                {selParts.map((p) => (
                  <Fragment key={p.bucket}>
                    <span className="flex items-center gap-2 text-[#cfcfcf]">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
                      {label(p.bucket)}
                    </span>
                    <span className="text-right text-white">{(p.frac * 100).toFixed(1)}%</span>
                    <span className="text-right text-white">{Math.round(p.count).toLocaleString()}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-[2px] sm:grid-cols-3">
              {combosOf(handName(hand)).map(([c1, c2]) => (
                <div
                  key={c1 + c2}
                  className="flex min-h-[96px] flex-col justify-between p-1.5"
                  style={{ background: topPart?.color ?? "#2a2a2d", opacity: (sel?.count ?? 0) <= 0 ? 0.35 : 1 }}
                >
                  <div className="flex items-start justify-between">
                    <span className="flex gap-0.5">
                      <CardChip c={c1} />
                      <CardChip c={c2} />
                    </span>
                    <span className="text-[12px] text-white">%</span>
                  </div>
                  <div className="text-[12px] leading-tight text-white tabular-nums">
                    {selParts.map((p) => (
                      <div key={p.bucket} className="flex justify-between gap-1">
                        <span className="truncate">{label(p.bucket)}</span>
                        <span>{+(p.frac * 100).toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** GEO の Equity chart: 手番の人のレンジ(実際の集計)の、ランダムな手に対する勝率の曲線。 */
function GeoEquity({ eq, weight, name }: { eq: number[][] | null; weight: number[]; name: string }) {
  if (!eq) return <div className="mb-2 h-[200px] rounded-b-xl rounded-tr-xl bg-[#1b1b1d]" />;
  const all = Array(169).fill(1);
  const h = curve(rangeEquity(eq, weight, all), weight);
  const W = 360;
  const H = 180;
  const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${(x * W).toFixed(1)},${((1 - y) * H).toFixed(1)}`).join(" ");
  return (
    <div className="mb-2 rounded-b-xl rounded-tr-xl bg-[#1b1b1d] p-2">
      <div className="mb-1 text-[12px] tabular-nums text-[#8fe388]">
        {name} 平均 {(h.avg * 100).toFixed(1)}%(ランダムな手に対して)
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0.25, 0.5, 0.75].map((y) => (
          <line key={y} x1={0} x2={W} y1={(1 - y) * H} y2={(1 - y) * H} stroke="#2f2f33" strokeWidth={1} />
        ))}
        <path d={path(h.pts)} fill="none" stroke="#8fe388" strokeWidth={2} />
      </svg>
      <p className="mt-1 text-[10px] text-[#9a9a9a]">GEO の集計には相手のレンジが無いので、ランダムな手に対する勝率で出す。</p>
    </div>
  );
}
