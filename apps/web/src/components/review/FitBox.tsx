"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** これより小さくは縮めない(読めなくなる)。それでも収まらなければ箱の中でスクロールする。 */
const MIN_ZOOM = 0.72;

/**
 * 高さの決まった箱に中身を収める。中身が箱より高ければ、文字も余白も一緒に縮める(`zoom`)。
 * 縮めると横幅も縮むので、中身の幅を 1/zoom 倍(px)に広げて箱の幅いっぱいに保つ(広げると行の折り返しが
 * 減って高さが変わるため、数回測り直して落ち着かせる)。
 *
 * 棋譜解析の解説カード用。カードの高さを場面によらず一定にしないと卓の大きさが変わってちらつき(v4.114.0)、
 * 一定にするだけだと短い解説のときに空白が大きすぎた(オーナー指摘)。そこで高さは中身の標準的な量に合わせて詰め、
 * 入りきらない解説は縮めて収める。
 */
export function FitBox({ className, children, contentKey }: { className?: string; children: ReactNode; contentKey?: unknown }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const zoomEl = zoomRef.current;
    const inner = innerRef.current;
    if (!box || !zoomEl || !inner) return;
    const fit = () => {
      const style = getComputedStyle(box);
      const available = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const width = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (available <= 0 || width <= 0) return;
      let z = 1;
      for (let i = 0; i < 4; i++) {
        zoomEl.style.zoom = String(z);
        // 幅は px で与える(px は zoom で縮むが、% は縮まないエンジンがある)。縮んだ後にちょうど箱の幅になる。
        zoomEl.style.width = `${width / z}px`;
        // 画面上の高さ(縮んだ後)÷ 倍率 = 縮める前の高さ。
        const natural = inner.getBoundingClientRect().height / z;
        const next = Math.max(MIN_ZOOM, Math.min(1, available / natural));
        if (Math.abs(next - z) < 0.01) break;
        z = next;
      }
      zoomEl.style.zoom = String(z);
      zoomEl.style.width = `${width / z}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [contentKey]);

  return (
    <div ref={boxRef} className={`overflow-y-auto overflow-x-hidden ${className ?? ""}`}>
      <div ref={zoomRef} style={{ transformOrigin: "0 0" }}>
        <div ref={innerRef}>{children}</div>
      </div>
    </div>
  );
}
