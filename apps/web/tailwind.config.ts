import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08080a",
          900: "#0d0d10",
          850: "#131316",
          800: "#18181c",
          700: "#222226",
          600: "#2e2e33",
          500: "#4a4a52",
          400: "#6f6f78",
          300: "#9a9aa2",
          200: "#c4c4ca",
          100: "#e8e8ea",
          50: "#f6f6f4",
        },
        felt: {
          900: "#0f1d18",
          800: "#16281f",
          700: "#1e3529",
        },
        gold: {
          400: "#d8bd85",
          500: "#c9a668",
          600: "#a9884f",
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
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'SF Pro Display'",
          "'Hiragino Sans'",
          "'Noto Sans JP'",
          "sans-serif",
        ],
      },
      boxShadow: {
        seat: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -8px rgba(0,0,0,0.6)",
        card: "0 2px 6px rgba(0,0,0,0.35)",
        panel: "0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 40px -16px rgba(0,0,0,0.7)",
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
          "0%": { boxShadow: "0 0 0 0 rgba(201,166,104,0.55)" },
          "100%": { boxShadow: "0 0 0 10px rgba(201,166,104,0)" },
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
