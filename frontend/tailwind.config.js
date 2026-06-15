/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // All-black "big-screen / DataV" palette: pure black canvas, near-black
        // panels separated by cyan-tinted hairlines, cyan primary + amber secondary.
        bg: {
          DEFAULT: "#000000",
          sunken: "#000000",
        },
        panel: {
          DEFAULT: "#06090c",
          raised: "#0a0e13",
          hover: "#0f151c",
        },
        accent: {
          DEFAULT: "#22d3ee",
          strong: "#06b6d4",
        },
        teal: {
          DEFAULT: "#2dd4bf",
        },
        amber: {
          DEFAULT: "#f5b53d",
        },
        line: {
          DEFAULT: "#15242b",
          strong: "#223a44",
        },
        ink: {
          DEFAULT: "#e6f2f5",
          muted: "#8ba0a8",
          faint: "#52646d",
        },
        state: {
          info: "#22d3ee",
          warning: "#f5b53d",
          critical: "#f4607a",
          ok: "#2dd4bf",
        },
      },
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
        panel: "0 0 0 1px rgba(34,211,238,0.04), 0 18px 50px -24px rgba(0,0,0,0.9)",
        glow: "0 0 24px -6px rgba(34,211,238,0.6)",
        "glow-accent":
          "0 0 0 1px rgba(34,211,238,0.22), 0 0 44px -12px rgba(34,211,238,0.50)",
        "glow-teal":
          "0 0 0 1px rgba(45,212,191,0.20), 0 0 44px -12px rgba(45,212,191,0.40)",
        "glow-amber":
          "0 0 0 1px rgba(245,181,61,0.22), 0 0 44px -12px rgba(245,181,61,0.45)",
        "card-hover": "0 0 0 1px rgba(34,211,238,0.18), 0 30px 80px -30px rgba(0,0,0,0.95)",
      },
      backgroundImage: {
        mesh:
          "radial-gradient(55% 50% at 12% -5%, rgba(34,211,238,0.10), transparent 60%), radial-gradient(45% 45% at 100% 0%, rgba(245,181,61,0.06), transparent 55%)",
        "accent-gradient": "linear-gradient(135deg, #22d3ee 0%, #2dd4bf 100%)",
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
