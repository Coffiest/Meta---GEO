"use client";

import { useEffect, useRef } from "react";
import { animalFromSeed, animalOf, animalSrc } from "@/lib/animalAvatars";

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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} />
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

/**
 * ユーザーのアイコン表示。写真(data URI)か、動物の絵10枚のどれか(animal:<id>)。
 * 人型の共通アイコンは廃止(オーナー指示)。全員を同じ規則・同じ意匠で描く。
 */
export function Avatar({
  avatarKey,
  displayName,
  size = 36,
  timer,
  frame,
}: {
  avatarKey: string | null | undefined;
  /** 現状は未使用だが、呼び出し側の互換性のため受け取る(将来のツールチップ等に備える)。 */
  displayName?: string;
  size?: number;
  timer?: { endsAt: number; durationMs: number; timeBank?: boolean } | null;
  /**
   * High Roller / Super High Roller の資格者の枠(銀 / 金)。サーバーが全員同じ形で返す値をそのまま渡す。
   * 枠の無い人は人間にも多数いるので、枠の有無で相手の種別は分からない。
   */
  frame?: "silver" | "gold" | null;
}) {
  const isPhoto = typeof avatarKey === "string" && avatarKey.startsWith("data:image/");
  const animal = animalOf(avatarKey) ?? animalFromSeed(displayName ?? "");
  // タイマーリングの分だけ内側に余白を取る。絶対配置のimg(置換要素)はinset指定だけでは
  // width/heightがコンテナいっぱいのまま縮まらず(right/bottomのinsetが無視される)リングと
  // 中心がズレる原因になっていたため、top/left/width/heightをすべてpx値で明示する。
  const pad = timer ? 6 : 3;
  const innerBoxStyle = { top: pad, left: pad, width: size - pad * 2, height: size - pad * 2 };

  // 枠はアイコンの外周に金属の輪として描く(アイコン本体の下に敷いた円が、外周の分だけはみ出して見える)。
  const frameWidth = Math.max(2, Math.round(size * 0.07));
  const frameInset = Math.max(0, pad - frameWidth);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {frame && (
        <span
          aria-hidden
          className={`pointer-events-none absolute rounded-full ${frame === "gold" ? "avatar-frame-gold" : "avatar-frame-silver"}`}
          style={{ inset: frameInset }}
        />
      )}
      {isPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarKey}
          alt=""
          draggable={false}
          className="absolute rounded-full object-cover select-none ring-1 ring-white/10"
          style={innerBoxStyle}
        />
      ) : (
        // 動物の絵(選んだもの。未設定は名前から決まる1枚で、誰でも同じ規則)。地は絵ごとの暗い色。
        <div
          className="absolute flex items-center justify-center overflow-hidden rounded-full select-none ring-1 ring-white/10"
          style={{ ...innerBoxStyle, background: animal.bg }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={animalSrc(animal.id)} alt="" draggable={false} className="h-[72%] w-[72%] object-contain" />
        </div>
      )}
      {/* タイマー表示中はアイコンを少し暗くして、中央の残り秒数(色付き数字)を見やすくする。
          画像/BOT/頭文字いずれのアバターでも一様に効くよう、内側ボックスに黒の半透明を重ねる。 */}
      {timer && (
        <div aria-hidden className="pointer-events-none absolute z-20 rounded-full bg-black/70" style={innerBoxStyle} />
      )}
      {/* タイムバンクで延長された手番は、金色の脈打つリングを重ねて「延長中」だと分かるようにする。
          相手が誰であっても同じ条件・同じ見た目で描画する(描画の差で相手の種別が推測できてはいけない)。 */}
      {timer?.timeBank && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[25] animate-time-bank-ring rounded-full"
          style={{ boxShadow: "0 0 0 2px rgb(var(--accent)), 0 0 12px 2px rgb(var(--accent) / 0.6)" }}
        />
      )}
      {timer && <CountdownRing endsAt={timer.endsAt} durationMs={timer.durationMs} size={size} />}
    </div>
  );
}
