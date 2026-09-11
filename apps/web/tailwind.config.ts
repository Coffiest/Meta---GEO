import type { Config } from "tailwindcss";

/** CSS変数(スペース区切りRGB)をTailwindの色として使うためのヘルパ。
 * `<alpha-value>` を差し込むことで `bg-canvas/60` のような不透明度指定が効く。
 * 実際の値は globals.css の `:root` にあり、色の実体は1箇所にしか存在しない。 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ── 中立ランプ(ダーク起点) ─────────────────────────────────
           n-0 が最も暗い沈み面、n-11 が最も明るい前景。Appleのダークテーマと同じく
           「暗い面ほど奥、明るい面ほど手前」で階層を表す。ダーク面では落ち影がほとんど
           見えないため、階層は影ではなくこの明度差と上端のハイライトで作る。 */
        n: {
          0: v("n-0"),
          1: v("n-1"),
          2: v("n-2"),
          3: v("n-3"),
          4: v("n-4"),
          5: v("n-5"),
          6: v("n-6"),
          7: v("n-7"),
          8: v("n-8"),
          9: v("n-9"),
          10: v("n-10"),
          11: v("n-11"),
        },

        /* ── 意味論エイリアス ──────────────────────────────────────
           コンポーネント側は原則こちらを使う。ランプ番号を直接書くのは、
           階調そのものが意味を持つ場合(グラデーション帯など)だけに留める。 */
        canvas: { DEFAULT: v("n-1"), sunken: v("n-0") },
        surface: { DEFAULT: v("n-3"), 2: v("n-4"), 3: v("n-5") },
        line: { DEFAULT: v("n-4"), strong: v("n-5") },
        fg: {
          DEFAULT: v("n-11"),
          2: v("n-8"),
          3: v("n-7"),
          faint: v("n-6"),
        },

        /* ── アクセント ────────────────────────────────────────────
           アクセント面に乗る文字は必ず `text-on-accent`(黒)。白は #26C2A3 上で
           2.25:1 と不合格、この黒は 8.79:1 で合格する。 */
        accent: {
          DEFAULT: v("accent"),
          hi: v("accent-hi"),
          400: v("accent-400"),
          lo: v("accent-lo"),
        },
        "on-accent": v("on-accent"),

        /* ── データ可視化の意味色 ──────────────────────────────────
           テーマの一部ではなく「意味を持つ色」。棋譜解析の9段階分類やGEOのアクション色と
           同じ役割なので、テーマ刷新の対象外として保持する。全て #1C1C1E 上で AA 以上。 */
        mint: { 300: "#7adcae", 400: "#3ecb8a", 500: "#1fae70", 600: "#189a5f", 700: "#0f7d4c" },
        crimson: { 300: "#f09490", 400: "#e8615a", 500: "#dd4438", 600: "#c23a2f" },
        azure: { 400: "#5c9bd6", 500: "#3a7fc4", 600: "#2f6cab" },
        // 4色デッキ(スペード=黒, ハート=赤, ダイヤ=青, クラブ=緑)。カード画像の意匠に対応。
        suit: { s: "#d8dae0", h: "#e8615a", d: "#3a7fc4", c: "#1fae70" },
        // GEO分析チャートのカテゴリカルカラー。ベース #1C1C1E に対し4色とも 4.68〜5.54 で AA 合格。
        chart: { raise: "#c98500", check: "#199e70", limp: "#3987e5", fold: "#e66767" },
      },

      fontFamily: {
        // 全面モノスペース。欧文・数字は JetBrains Mono、和文はそこに無いので M PLUS 1 Code へ
        // 自動的に落ちる(この並び順がそのまま解決順になる)。sans 自体を差し替えているので、
        // 既存の font-sans 指定もデフォルト継承も、書き換え無しで同じフォントになる。
        sans: ["var(--font-mono)", "'JetBrains Mono'", "'M PLUS 1 Code'", "ui-monospace", "SFMono-Regular", "monospace"],
        mono: ["var(--font-mono)", "'JetBrains Mono'", "'M PLUS 1 Code'", "ui-monospace", "SFMono-Regular", "monospace"],
      },

      /* ── タイポグラフィ ──────────────────────────────────────────
         トラッキングとレディングはサイズ固有。大きい文字は字間が開いて見えるので詰め、
         行間も詰める。小さい文字は逆に少し開いて可読性を上げる。1つの letter-spacing を
         全サイズに使うのは、どこかのサイズで必ず間違っている。 */
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.05rem", letterSpacing: "0.01em" }],
        sm: ["0.875rem", { lineHeight: "1.25rem", letterSpacing: "0.005em" }],
        base: ["1rem", { lineHeight: "1.5rem", letterSpacing: "0em" }],
        lg: ["1.125rem", { lineHeight: "1.6rem", letterSpacing: "-0.006em" }],
        xl: ["1.25rem", { lineHeight: "1.7rem", letterSpacing: "-0.011em" }],
        "2xl": ["1.5rem", { lineHeight: "1.9rem", letterSpacing: "-0.015em" }],
        "3xl": ["1.875rem", { lineHeight: "2.2rem", letterSpacing: "-0.019em" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.022em" }],
        "5xl": ["3rem", { lineHeight: "3.15rem", letterSpacing: "-0.026em" }],
        "6xl": ["3.75rem", { lineHeight: "3.8rem", letterSpacing: "-0.03em" }],
        "7xl": ["4.5rem", { lineHeight: "4.5rem", letterSpacing: "-0.032em" }],
      },
      fontWeight: {
        // JetBrains Mono の可変軸の上限は 800、M PLUS 1 Code は 700 で、どちらも 900 を持たない。
        // font-black を 900 のままにするとブラウザが軸上限へクランプするだけなので、実態に合わせる。
        black: "800",
      },

      /* ── 高さ(エレベーション) ───────────────────────────────────
         ダーク面では落ち影が背景に沈んで見えないため、上端の内側ハイライト
         (=面が光を拾っている表現)を必ず一緒に持たせる。大きい面ほど影を深く、
         ハイライトを強くして「厚みがある」と読ませる。 */
      boxShadow: {
        e0: "inset 0 1px 0 rgb(255 255 255 / 0.05)",
        e1: "0 1px 2px rgb(0 0 0 / 0.40), inset 0 1px 0 rgb(255 255 255 / 0.06)",
        e2: "0 4px 16px -4px rgb(0 0 0 / 0.55), inset 0 1px 0 rgb(255 255 255 / 0.07)",
        e3: "0 12px 32px -8px rgb(0 0 0 / 0.65), inset 0 1px 0 rgb(255 255 255 / 0.08)",
        e4: "0 24px 64px -12px rgb(0 0 0 / 0.75), inset 0 1px 0 rgb(255 255 255 / 0.10)",
        // アクセントの発光。1画面に1つだけ置く「主役」の合図として使う。
        glow: "0 0 0 1px rgb(var(--accent) / 0.35), 0 10px 36px -8px rgb(var(--accent) / 0.45)",
        "glow-sm": "0 0 16px -4px rgb(var(--accent) / 0.50)",
        // プレイ画面(暗色)専用。座席の立体感。
        seat: "0 1px 2px rgb(0 0 0 / 0.45), 0 8px 24px -8px rgb(0 0 0 / 0.65)",
      },

      borderRadius: {
        // カード意匠の基準。Appleの連続角丸に寄せ、面が大きいほど半径も大きくする。
        card: "1.25rem",
        sheet: "1.5rem",
        xl2: "1.25rem",
      },

      /* ── モーション ──────────────────────────────────────────────
         ジェスチャで触れるものは全て framer-motion のスプリング(src/lib/motion.ts)で動かす。
         ここに置くのは、ユーザーが掴めない環境アニメーション(発光の明滅など)だけ。
         スプリングは中断・再ターゲットができるが、keyframes はできないため。 */
      transitionTimingFunction: {
        // 掴めないUIのための減速カーブ。スプリングの立ち上がりに見た目を寄せてある。
        emphasized: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "deal-in": {
          "0%": { opacity: "0", transform: "translateY(-12px) scale(0.85)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // 手番の席を示す拡散リング。opacity/transformのみを動かすため、コンポジタだけで
        // 完結しメインスレッドを消費しない(発熱対策)。
        "acting-ring": {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "0", transform: "scale(1.14)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--accent) / 0.55)" },
          "100%": { boxShadow: "0 0 0 10px rgb(var(--accent) / 0)" },
        },
        "pulse-ring-mint": {
          "0%": { boxShadow: "0 0 0 0 rgb(31 174 112 / 0.55)" },
          "100%": { boxShadow: "0 0 0 8px rgb(31 174 112 / 0)" },
        },
        // タイムバンクで延長中の席を示すリング。opacityだけを動かして軽く保つ。
        "time-bank-ring": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "time-bank-badge": {
          "0%": { opacity: "0", transform: "translateY(4px) scale(0.9)" },
          "12%, 70%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(-3px) scale(1)" },
        },
      },
      animation: {
        "deal-in": "deal-in 260ms cubic-bezier(0.16,1,0.3,1) both",
        "acting-ring": "acting-ring 1.6s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.4s cubic-bezier(0.4,0,0.6,1) infinite",
        "pulse-ring-mint": "pulse-ring-mint 1.3s cubic-bezier(0.4,0,0.6,1) infinite",
        "time-bank-ring": "time-bank-ring 1.1s ease-in-out infinite",
        "time-bank-badge": "time-bank-badge 2.6s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
