import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, c(`primary-${s}`)]),
);

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: c("bg"), elevated: c("bg-elevated") },
        surface: { DEFAULT: c("surface"), 2: c("surface-2") },
        border: { DEFAULT: c("border"), strong: c("border-strong") },
        fg: { DEFAULT: c("text"), 2: c("text-2") },
        muted: { DEFAULT: c("muted"), foreground: c("muted") },
        primary: {
          ...scale,
          DEFAULT: c("primary"),
          hover: c("primary-hover"),
          active: c("primary-active"),
          fg: c("primary-fg"),
          foreground: c("primary-fg"),
          text: c("primary-text"),
          soft: "var(--primary-soft)",
        },
        accent: { DEFAULT: c("accent"), text: c("accent-text"), soft: "var(--accent-soft)", foreground: c("text") },
        success: c("success"),
        danger: { DEFAULT: c("danger"), soft: "var(--danger-soft)" },
        warning: { DEFAULT: c("warning"), soft: "var(--warning-soft)" },
        info: c("info"),
        ring: c("ring"),
        chart: {
          1: c("chart-1"),
          2: c("chart-2"),
          3: c("chart-3"),
          4: c("chart-4"),
          5: c("chart-5"),
          6: c("chart-6"),
          grid: c("chart-grid"),
        },
        // shadcn/ui aliases
        background: c("bg"),
        foreground: c("text"),
        card: { DEFAULT: c("surface"), foreground: c("text") },
        popover: { DEFAULT: c("surface"), foreground: c("text") },
        secondary: { DEFAULT: c("surface-2"), foreground: c("text") },
        destructive: { DEFAULT: c("danger"), foreground: c("primary-fg") },
        input: c("border"),
        lime: c("lime"),
        cyan: c("cyan"),
        cobalt: c("cobalt"),
        violet: c("violet"),
      },
      backgroundImage: { prism: "var(--prism)" },
      borderColor: { DEFAULT: c("border") },
      ringColor: { DEFAULT: c("ring") },
      borderRadius: { none: "0px", sm: "6px", DEFAULT: "10px", md: "10px", lg: "14px", xl: "18px", "2xl": "24px" },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-geist-sans)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        eyebrow: ["11px", { lineHeight: "1.4", letterSpacing: "0.18em" }],
        button: ["12px", { lineHeight: "1", letterSpacing: "0.14em" }],
        display: ["clamp(2.3rem, 4.6vw, 4.4rem)", { lineHeight: "1.02", letterSpacing: "-0.03em" }],
      },
      letterSpacing: { eyebrow: "0.18em", button: "0.14em", wordmark: "0.2em" },
      boxShadow: { glow: "var(--glow)", card: "var(--shadow-card)" },
      transitionTimingFunction: { out: "cubic-bezier(.2,.8,.2,1)" },
      keyframes: {
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        caret: { "0%, 49%": { opacity: "1" }, "50%, 100%": { opacity: "0" } },
        rise: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        tick: { "0%": { opacity: "0.4" }, "100%": { opacity: "1" } },
        dash: { to: { strokeDashoffset: "-24" } },
        scan: { from: { transform: "translateX(-60px)" }, to: { transform: "translateX(60px)" } },
        needle: { from: { transform: "rotate(-70deg)" }, to: { transform: "rotate(8deg)" } },
        "prism-pan": { from: { backgroundPosition: "0% 50%" }, to: { backgroundPosition: "200% 50%" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
      },
      animation: {
        marquee: "marquee 40s linear infinite",
        shimmer: "shimmer 1.6s linear infinite",
        caret: "caret 1s steps(1) infinite",
        rise: "rise 400ms cubic-bezier(.2,.8,.2,1) both",
        tick: "tick 300ms cubic-bezier(.2,.8,.2,1)",
        "prism-pan": "prism-pan 6s linear infinite",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  // .container is defined in globals.css: near full width on desktop instead of stepped max-widths
  corePlugins: { container: false },
  plugins: [animate],
};

export default config;
