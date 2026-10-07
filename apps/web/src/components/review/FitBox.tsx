"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** これより小さくは縮めない(読めなくなる)。それでも収まらなければ箱の中でスクロールする。 */
const MIN_ZOOM = 0.66;

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

  // 縮めるのは CSS の zoom ではなく transform: scale で行う。zoom は iOS Safari と Chromium で
  // 測った高さの扱いが違い、iPhone で下の行(情報の行)が見切れていた(オーナー指摘)。
  // offsetHeight は transform の影響を受けないレイアウトの高さなので、どのエンジンでも同じ値で計算できる。
  useLayoutEffect(() => {
    const box = boxRef.current;
    const scaler = zoomRef.current;
    const inner = innerRef.current;
    if (!box || !scaler || !inner) return;
    const fit = () => {
      const style = getComputedStyle(box);
      const available = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const width = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (available <= 0 || width <= 0) return;
      let s = 1;
      for (let i = 0; i < 5; i++) {
        // 縮めた後にちょうど箱の幅になるよう、中身の幅を 1/s 倍に広げてから高さを測る。
        inner.style.width = `${width / s}px`;
        const natural = inner.offsetHeight;
        // 端数で1pxはみ出さないよう、わずかに余裕を持たせる。
        const next = Math.max(MIN_ZOOM, Math.min(1, (available - 1) / natural));
        if (Math.abs(next - s) < 0.005) {
          s = next;
          break;
        }
        s = next;
      }
      inner.style.width = `${width / s}px`;
      inner.style.transform = `scale(${s})`;
      // transform は場所を取る大きさを変えないので、外側の高さを縮んだ後の高さに合わせる(下に空白・はみ出しを作らない)。
      scaler.style.height = `${inner.offsetHeight * s}px`;
    };
    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(box);
    // 「詳しく見る」を開いたときなど、中身があとから変わったときも測り直す。
    ro.observe(inner);
    return () => ro.disconnect();
  }, [contentKey]);

  return (
    <div ref={boxRef} className={`overflow-y-auto overflow-x-hidden ${className ?? ""}`}>
      <div ref={zoomRef} className="overflow-hidden">
        <div ref={innerRef} style={{ transformOrigin: "0 0" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
