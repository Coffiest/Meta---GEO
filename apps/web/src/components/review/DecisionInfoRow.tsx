"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { bucketColor, bucketTextColor } from "@/components/geo/colors";
import type { GtoActionEV } from "@/lib/reviewApi";

/**
 * 決定の情報(`Preflop · ES 36BB · Pot 2.5BB`)と、GTO の正解のアクション(`Fold 100% EV+0.0`)を**常に1行**に並べる。
 *
 * 以前は収まらないときに正解のアクションを次の行に回していて、場面によって横に出たり下に出たりした(オーナー指摘)。
 * 今は折り返さない。行に収まる倍率を実測して、行ごと縮める(`zoom`。文字も余白も一緒に縮む)。
 */
export function DecisionInfoRow({
  info,
  gtoActions,
  labelOf,
}: {
  info?: string;
  gtoActions?: readonly GtoActionEV[] | null;
  /** バケットの表示名(ストリートで語彙が違うので呼び出し側が渡す)。 */
  labelOf: (bucket: string) => string;
}) {
  const chips = (gtoActions ?? []).filter((a) => a.frequency > 0);
  const outerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const chipKey = chips.map((c) => `${c.bucket}:${c.frequency}:${c.evBb}`).join("|");
  useLayoutEffect(() => {
    const outer = outerRef.current;
    const row = rowRef.current;
    if (!outer || !row) return;
    const measure = () => {
      // 縮める前の行の幅 = 画面上の幅 ÷ 今の倍率。
      const current = Number(row.style.zoom || "1") || 1;
      const natural = row.getBoundingClientRect().width / current;
      if (natural <= 0) return;
      setScale(Math.min(1, outer.clientWidth / natural));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [chipKey, info]);

  if (!info && chips.length === 0) return null;
  return (
    <div ref={outerRef} className="mt-2 w-full overflow-hidden">
      <div ref={rowRef} className="flex w-max flex-nowrap items-center gap-2" style={{ zoom: scale }}>
        {info && (
          <p className="shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums text-fg-3">{info}</p>
        )}
        {chips.length > 0 && (
          <div className="flex shrink-0 flex-nowrap items-center gap-1" aria-label="GTOの正解のアクション">
            {chips.map((a) => (
              <span
                key={a.bucket}
                className="inline-flex shrink-0 items-baseline whitespace-nowrap rounded-full px-1.5 py-[2px]"
                style={{ background: bucketColor(a.bucket), color: bucketTextColor(bucketColor(a.bucket)) }}
              >
                <span className="text-[10px] font-bold">{labelOf(a.bucket)}</span>
                <span className="ml-1 text-[10px] font-black tabular-nums">{Math.round(a.frequency * 100)}%</span>
                {/* GTO Wizard の解のように EV の無いデータ(全て 0)では EV を出さない。 */}
                {chips.some((c) => c.evBb !== 0) && (
                  <span className="ml-1 text-[8px] font-bold tabular-nums opacity-80">
                    EV{a.evBb >= 0 ? "+" : ""}
                    {a.evBb.toFixed(1)}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
