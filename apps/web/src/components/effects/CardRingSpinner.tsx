"use client";

/**
 * ローディング表示用のトランプ3Dリング。エース4枚(♠♥♦♣)を奥行きのある環状に配置し、
 * ゆっくり自動回転させる ―― 「読み込み中=カードをシャッフルしている」の比喩として、
 * アプリ全体のゲート的なローディング画面(page.tsx の LoadingScreen)で使う。
 *
 * カードごとの角度(360deg / 枚数 × index)はCSS変数で算出するため、疑似要素+
 * transform-style:preserve-3d を使うこの効果はTailwindユーティリティで表現できず、
 * globals.css の `.card-ring-*` クラス(+このコンポーネントが渡すCSS変数)で実現する。
 * 画像は新規デザインではなく、差し込み済みのトランプ意匠(/cards/{1s,1h,1d,1c}.png)を
 * そのまま使う。
 * (出典: uiverse.io by ilkhoeri)
 */
const RING_CARDS = ["1s.png", "1h.png", "1d.png", "1c.png"] as const;

export function CardRingSpinner({ size = 40 }: { size?: number }) {
  const w = size;
  const h = Math.round(size * 1.5);
  return (
    <div
      aria-hidden
      className="card-ring-wrapper"
      style={{ width: w * 2.4, height: h * 1.4 }}
    >
      <div
        className="card-ring-inner"
        style={{ "--card-ring-w": `${w}px`, "--card-ring-h": `${h}px` } as React.CSSProperties}
      >
        {RING_CARDS.map((file, i) => (
          <div
            key={file}
            className="card-ring-card"
            style={{ "--card-ring-quantity": RING_CARDS.length, "--card-ring-index": i } as React.CSSProperties}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 小さな装飾画像で静的最適化は不要 */}
            <img src={`/cards/${file}`} alt="" draggable={false} className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
}
