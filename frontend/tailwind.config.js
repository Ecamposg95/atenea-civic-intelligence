/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: (() => {
        const ch = (v) => `rgb(var(${v}) / <alpha-value>)`;
        return {
          bg: { DEFAULT: ch("--c-bg"), sunken: ch("--c-bg-sunken") },
          panel: { DEFAULT: ch("--c-panel"), raised: ch("--c-panel-raised"), hover: ch("--c-panel-hover") },
          accent: { DEFAULT: ch("--c-accent"), strong: ch("--c-accent-strong") },
          teal: { DEFAULT: ch("--c-teal") },
          amber: { DEFAULT: ch("--c-amber") },
          line: { DEFAULT: ch("--c-line"), strong: ch("--c-line-strong") },
          ink: { DEFAULT: ch("--c-ink"), muted: ch("--c-ink-muted"), faint: ch("--c-ink-faint") },
          state: { info: ch("--c-info"), warning: ch("--c-warning"), critical: ch("--c-critical"), ok: ch("--c-ok") },
        };
      })(),
      borderRadius: {
        card: "14px",
        pill: "999px",
      },
      fontFamily: {
        display: ["Sora", "system-ui", "sans-serif"],
        sans: [
          "Manrope",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        glow: "var(--glow)",
        "glow-accent": "var(--glow-accent)",
        "glow-teal": "var(--glow-teal)",
        "glow-amber": "var(--glow-amber)",
        "card-hover": "var(--shadow-card-hover)",
      },
      backgroundImage: {
        mesh:
          "radial-gradient(55% 50% at 12% -5%, rgba(34,211,238,0.10), transparent 60%), radial-gradient(45% 45% at 100% 0%, rgba(245,181,61,0.06), transparent 55%)",
        "accent-gradient": "var(--accent-gradient)",
        sheen:
          "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "fade-up": "fade-up .6s cubic-bezier(.16,1,.3,1) both",
        "fade-in": "fade-in .5s ease-out both",
        "pulse-glow": "pulse-glow 2.8s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
