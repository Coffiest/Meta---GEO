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
      },
      animation: {
        "deal-in": "deal-in 260ms cubic-bezier(0.16,1,0.3,1) both",
        "pulse-ring": "pulse-ring 1.4s cubic-bezier(0.4,0,0.6,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
