import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f7f6",
          100: "#eeeeec",
          200: "#d8d8d4",
          300: "#b8b8b1",
          400: "#878781",
          500: "#5d5d57",
          600: "#3d3d38",
          700: "#2a2a26",
          800: "#1c1c19",
          900: "#0e0e0c",
        },
        accent: {
          DEFAULT: "#1f8a5a",
          soft: "#dbf3e4",
          warn: "#c2410c",
          warnSoft: "#fde6d3",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Inter", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
