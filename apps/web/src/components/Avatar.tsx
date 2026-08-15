"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

/** リングの再描画間隔(ms)。10fpsあれば秒読みのリングとして十分滑らかに見える。 */
const RING_PAINT_INTERVAL_MS = 100;

/**
 * 残り持ち時間をアバターの周囲を一周する円弧で表現するリング(SunVy Poker方式)。
 *
 * 重要(端末の発熱対策): 以前はrequestAnimationFrameのたびにsetStateしていたため、
 * 手番が回っている間ずっと毎秒60回のReact再描画が走り、スマートフォンが異常に発熱していた。
 * 現在はReactのstateを一切使わず、ref経由でSVG属性とテキストを直接書き換える。
 * 更新も10fpsに間引く(見た目は変わらない)。
 */
function CountdownRing({ endsAt, durationMs, size }: { endsAt: number; durationMs: number; size: number }) {
  const arcRef = useRef<SVGCircleElement | null>(null);
  const secondsRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);

  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    let lastPaintAt = -Infinity;
    let lastSeconds = -1;
    const tick = (ts: number) => {
      const remaining = Math.max(0, endsAt - Date.now());
      if (ts - lastPaintAt >= RING_PAINT_INTERVAL_MS) {
        lastPaintAt = ts;
        const fraction = durationMs > 0 ? Math.min(1, remaining / durationMs) : 0;
        const color = fraction > 0.5 ? "#1fae70" : fraction > 0.2 ? "#f59e0b" : "#e5484d";
        const arc = arcRef.current;
        if (arc) {
          arc.setAttribute("stroke-dashoffset", String(circumference * (1 - fraction)));
          arc.setAttribute("stroke", color);
        }
        const seconds = Math.ceil(remaining / 1000);
        const node = secondsRef.current;
        if (node) {
          if (seconds !== lastSeconds) {
            node.textContent = String(seconds);
            lastSeconds = seconds;
          }
          node.style.color = color;
        }
      }
      if (remaining > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [endsAt, durationMs, circumference]);

  const initialSeconds = Math.ceil(Math.max(0, endsAt - Date.now()) / 1000);

  return (
    <>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(10,10,10,0.12)" strokeWidth={stroke} />
        <circle
          ref={arcRef}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#1fae70"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={0}
        />
      </svg>
      {/* 残り秒数をアイコン中央に数字表示(SunVy/ポーカーチェイス方式)。黒フチ白抜きで視認性確保。 */}
      <div
        ref={secondsRef}
        className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center font-black tabular-nums"
        style={{
          fontSize: Math.round(size * 0.42),
          color: "#1fae70",
          textShadow: "0 1px 2px rgba(255,255,255,0.9), 0 0 3px rgba(255,255,255,0.9)",
        }}
      >
        {initialSeconds}
      </div>
    </>
  );
}

/** アイコン未設定(BOT含む)のプレイヤー用のモノクロ人型シルエット。
 * 白背景・黒(ink-950)の人アイコンで、頭文字やBOTキャラは使わず全員この共通アイコンにする。
 * 円形コンテナ(overflow-hidden)で肩の両端が自然にトリミングされ、胸像風のアバターになる。 */
/**
 * ユーザーのアイコン表示。カメラロールから選んだ画像(data URI)が設定されていればそれを、
 * 未設定(BOT含む)なら共通のモノクロ人型シルエットを表示する(頭文字・BOTキャラアバターは廃止)。
 */
export function Avatar({
  avatarKey,
  displayName,
  size = 36,
  timer,
}: {
  avatarKey: string | null | undefined;
  /** 現状は未使用だが、呼び出し側の互換性のため受け取る(将来のツールチップ等に備える)。 */
  displayName?: string;
  size?: number;
  timer?: { endsAt: number; durationMs: number; timeBank?: boolean } | null;
}) {
  const isPhoto = typeof avatarKey === "string" && avatarKey.startsWith("data:image/");
  // タイマーリングの分だけ内側に余白を取る。絶対配置のimg(置換要素)はinset指定だけでは
  // width/heightがコンテナいっぱいのまま縮まらず(right/bottomのinsetが無視される)リングと
  // 中心がズレる原因になっていたため、top/left/width/heightをすべてpx値で明示する。
  const pad = timer ? 6 : 3;
  const innerBoxStyle = { top: pad, left: pad, width: size - pad * 2, height: size - pad * 2 };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {isPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarKey}
          alt=""
          draggable={false}
          className="absolute rounded-full object-cover select-none ring-1 ring-black/20"
          style={innerBoxStyle}
        />
      ) : (
        <div
          className="absolute rounded-full bg-white flex items-end justify-center select-none ring-[1.5px] ring-ink-950 text-ink-950 overflow-hidden"
          style={innerBoxStyle}
        >
          <Icon
            name="user"
            filled
            className=""
            style={{ width: size - pad * 2, height: size - pad * 2 }}
          />
        </div>
      )}
      {/* タイマー表示中はアイコンを少し暗くして、中央の残り秒数(色付き数字)を見やすくする。
          画像/BOT/頭文字いずれのアバターでも一様に効くよう、内側ボックスに黒の半透明を重ねる。 */}
      {timer && (
        <div aria-hidden className="pointer-events-none absolute z-20 rounded-full bg-black/40" style={innerBoxStyle} />
      )}
      {/* タイムバンクで延長された手番は、金色の脈打つリングを重ねて「延長中」だと分かるようにする。
          相手が誰であっても同じ条件・同じ見た目で描画する(描画の差で相手の種別が推測できてはいけない)。 */}
      {timer?.timeBank && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[25] animate-time-bank-ring rounded-full"
          style={{ boxShadow: "0 0 0 2px #f2a900, 0 0 10px 2px rgba(242,169,0,0.65)" }}
        />
      )}
      {timer && <CountdownRing endsAt={timer.endsAt} durationMs={timer.durationMs} size={size} />}
    </div>
  );
}
