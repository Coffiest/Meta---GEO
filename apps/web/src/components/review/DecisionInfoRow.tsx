"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { bucketColor, bucketTextColor } from "@/components/geo/colors";
import type { GtoActionEV } from "@/lib/reviewApi";

/** これより小さくは縮めない(読めなくなる)。収まらなければ折り返す。 */
const MIN_SCALE = 0.62;

/**
 * 決定の情報(`Preflop · ES 36BB · Pot 2.5BB`)と、GTO の正解のアクション(`Fold 100% EV+0.0`)を1行に並べる。
 *
 * 以前は情報の下に正解のアクションを大きく並べていて、解析の画面の高さを使っていた(オーナー指摘)。
 * 正解のアクションを小さくして情報の横に置く。端末の幅で見切れないよう、行に収まる倍率を実測して
 * 縮める(`zoom`。文字も余白も一緒に縮む)。MIN_SCALE まで縮めても収まらなければ次の行に回す。
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
  const rowRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLParagraphElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [wrap, setWrap] = useState(false);

  const chipKey = chips.map((c) => `${c.bucket}:${c.frequency}:${c.evBb}`).join("|");
  useLayoutEffect(() => {
    const row = rowRef.current;
    const chipsEl = chipsRef.current;
    if (!row || !chipsEl) return;
    const measure = () => {
      // 実寸(倍率1のとき)の幅。zoom 中の scrollWidth は縮んだ値なので、今の倍率で割って戻す。
      const current = Number(chipsEl.style.zoom || "1") || 1;
      const natural = chipsEl.scrollWidth / current;
      const infoWidth = infoRef.current?.offsetWidth ?? 0;
      const available = row.clientWidth - infoWidth - (infoWidth > 0 ? 8 : 0);
      if (natural <= 0) return;
      const next = Math.min(1, available / natural);
      if (next >= MIN_SCALE) {
        setScale(next);
        setWrap(false);
      } else {
        // 横に置くと読めない大きさになる幅では、次の行に回して、その行の幅に収める。
        setWrap(true);
        setScale(Math.max(MIN_SCALE, Math.min(1, row.clientWidth / natural)));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [chipKey, info]);

  if (!info && chips.length === 0) return null;
  return (
    <div ref={rowRef} className={`mt-2 flex items-center gap-2 ${wrap ? "flex-wrap" : "flex-nowrap"}`}>
      {info && (
        <p ref={infoRef} className="shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums text-fg-3">
          {info}
        </p>
      )}
      {chips.length > 0 && (
        <div
          ref={chipsRef}
          className="flex min-w-0 flex-nowrap items-center gap-1"
          style={{ zoom: scale }}
          aria-label="GTOの正解のアクション"
        >
          {chips.map((a) => (
            <span
              key={a.bucket}
              className="inline-flex shrink-0 items-baseline whitespace-nowrap rounded-full px-1.5 py-[2px]"
              style={{ background: bucketColor(a.bucket), color: bucketTextColor(bucketColor(a.bucket)) }}
            >
              <span className="text-[10px] font-bold">{labelOf(a.bucket)}</span>
              <span className="ml-1 text-[10px] font-black tabular-nums">{Math.round(a.frequency * 100)}%</span>
              <span className="ml-1 text-[8px] font-bold tabular-nums opacity-80">
                EV{a.evBb >= 0 ? "+" : ""}
                {a.evBb.toFixed(1)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
