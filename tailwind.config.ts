import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07080c",
          900: "#0b0d14",
          850: "#10131c",
          800: "#161a26",
          700: "#1e2433",
          600: "#2a3144",
        },
        mist: {
          50: "#f5f3ee",
          100: "#e8e4d9",
          400: "#9a9588",
          500: "#7a7568",
        },
        gold: {
          300: "#e8c991",
          400: "#d4a574",
          500: "#c4924a",
        },
        iris: {
          300: "#b4c0ff",
          400: "#8b9cff",
          500: "#6d7ef0",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px -12px rgba(139, 156, 255, 0.35)",
        gold: "0 0 40px -12px rgba(212, 165, 116, 0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
