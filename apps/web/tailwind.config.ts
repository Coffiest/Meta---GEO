import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Swiss/monochrome デザインシステムの中立スケール。真のグレースケール(彩度0)で統一し、
        // アクセントは gold のみに限定する。950=ほぼ黒、50=純白。
        ink: {
          950: "#0a0a0a",
          900: "#171717",
          850: "#262626",
          800: "#404040",
          700: "#525252",
          600: "#737373",
          500: "#a3a3a3",
          400: "#d4d4d4",
          300: "#e5e5e5",
          200: "#eeeeee",
          100: "#f5f5f5",
          50: "#ffffff",
        },
        felt: {
          900: "#0f1d18",
          800: "#16281f",
          700: "#1e3529",
        },
        // GTO Poker のアクセントカラー。RRPoker(姉妹アプリ)と統一したアンバーゴールド。
        gold: {
          400: "#f7c548",
          500: "#f2a900",
          600: "#d4910a",
        },
        rose: {
          400: "#c76a63",
          500: "#b3554e",
        },
        // プレイ画面(テーブル)専用の配色。参考アプリ(ダークネイビー背景 + 赤=レイズ/緑=コール/青=フォールド)
        // に合わせたトークンで、NameGate/GEO分析画面のink/goldパレットとは独立させてある。
        navy: {
          950: "#0a0f1c",
          900: "#101a2c",
          850: "#152238",
          800: "#1a2942",
          700: "#25365a",
          600: "#374b74",
          500: "#5b6f96",
          400: "#8a97b5",
          300: "#b7c0d6",
          200: "#dde2ee",
          100: "#eef1f7",
          50: "#f7f9fc",
        },
        mint: {
          300: "#7adcae",
          400: "#3ecb8a",
          500: "#1fae70",
          600: "#189a5f",
        },
        crimson: {
          300: "#f09490",
          400: "#e8615a",
          500: "#dd4438",
          600: "#c23a2f",
        },
        azure: {
          400: "#5c9bd6",
          500: "#3a7fc4",
          600: "#2f6cab",
        },
        // 4色デッキ(差し込み済みカードデザインに合わせた配色: スペード=黒, ハート=赤, ダイヤ=青, クラブ=緑)
        suit: {
          s: "#d8dae0",
          h: "#e8615a",
          d: "#3a7fc4",
          c: "#1fae70",
        },
        // GEO分析チャート用の検証済みカテゴリカルカラー(dataviz skillのvalidate_palette.jsで
        // ダーク面 #0d0d10 に対して4色ともPASSした組み合わせ・順序)。
        chart: {
          raise: "#c98500",
          check: "#199e70",
          limp: "#3987e5",
          fold: "#e66767",
        },
      },
      fontFamily: {
        // 姉妹アプリRRPokerと統一したフォントスタック。本体はlayout.tsxのnext/font/googleで
        // 読み込んだPlus Jakarta Sansがbodyに直接適用されるが、フォールバックもここで揃えておく。
        sans: [
          "'Plus Jakarta Sans'",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Hiragino Sans'",
          "'Noto Sans JP'",
          "sans-serif",
        ],
      },
      boxShadow: {
        // テーブルプレイ画面(暗色)専用。プレイ中の座席の立体感を出す濃いシャドウ。
        seat: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -8px rgba(0,0,0,0.6)",
        // RRPokerの ios-card に寄せた柔らかいシャドウ(白背景・暗色テーブル背景の両方で使われるため
        // ios-card本家よりわずかに濃いめにして、暗いネイビー面でも輪郭が消えないようにしてある)。
        card: "0 2px 8px rgba(0,0,0,0.16), 0 1px 2px rgba(0,0,0,0.10)",
        panel: "0 4px 16px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      keyframes: {
        "deal-in": {
          "0%": { opacity: "0", transform: "translateY(-12px) scale(0.85)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(242,169,0,0.55)" },
          "100%": { boxShadow: "0 0 0 10px rgba(242,169,0,0)" },
        },
        "pulse-ring-mint": {
          "0%": { boxShadow: "0 0 0 0 rgba(31,174,112,0.55)" },
          "100%": { boxShadow: "0 0 0 8px rgba(31,174,112,0)" },
        },
      },
      animation: {
        "deal-in": "deal-in 260ms cubic-bezier(0.16,1,0.3,1) both",
        "pulse-ring": "pulse-ring 1.4s cubic-bezier(0.4,0,0.6,1) infinite",
        "pulse-ring-mint": "pulse-ring-mint 1.3s cubic-bezier(0.4,0,0.6,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
