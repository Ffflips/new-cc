import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0F14",
        panel: "#121821",
        panelLine: "#1F2933",
        fg: "#E7ECF2",
        muted: "#7C8A9A",
        up: "#4FD1A5",
        down: "#E0665A",
        brass: "#C9A15A",
        brassDim: "#8A7345"
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
