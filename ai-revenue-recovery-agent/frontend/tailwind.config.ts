import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#10161F",
          soft: "#1A2230",
          muted: "#5B6472",
        },
        paper: {
          DEFAULT: "#F6F4EE",
          raised: "#FCFBF7",
        },
        line: {
          DEFAULT: "#DCD7C8",
          dark: "rgba(246,244,238,0.12)",
        },
        ledger: {
          DEFAULT: "#1C3D5A",
          light: "#2C5680",
          pale: "#E7EEF3",
        },
        recovered: {
          DEFAULT: "#1F7A5C",
          pale: "#E4F1EB",
        },
        risk: {
          DEFAULT: "#B5790C",
          pale: "#F7ECD9",
        },
        stopped: {
          DEFAULT: "#B0402F",
          pale: "#F6E6E2",
        },
        escalate: {
          DEFAULT: "#6A4C93",
          pale: "#EEE7F5",
        },
      },
      fontFamily: {
        serif: ['"Source Serif 4"', "Georgia", "serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "4px",
        md: "6px",
      },
      boxShadow: {
        none: "none",
        card: "0 1px 0 0 rgba(16,22,31,0.04)",
      },
      letterSpacing: {
        tightish: "-0.01em",
      },
    },
  },
  plugins: [],
};
export default config;
