/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#070b14",
          sunken: "#050811",
        },
        panel: {
          DEFAULT: "#0d1422",
          raised: "#121b2d",
          hover: "#18233a",
        },
        accent: {
          DEFAULT: "#4f9cff",
          strong: "#2f7fff",
        },
        teal: {
          DEFAULT: "#2dd4bf",
        },
        line: {
          DEFAULT: "#1c2740",
          strong: "#2a3a5c",
        },
        ink: {
          DEFAULT: "#e8eef9",
          muted: "#9fb0cc",
          faint: "#5e6f8f",
        },
        state: {
          info: "#4f9cff",
          warning: "#d8b25a",
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
        panel: "0 1px 0 rgba(255,255,255,0.02), 0 12px 40px -16px rgba(0,0,0,0.6)",
        glow: "0 0 24px -6px rgba(79,156,255,0.5)",
        "glow-accent":
          "0 0 0 1px rgba(79,156,255,0.18), 0 16px 50px -18px rgba(79,156,255,0.40)",
        "glow-teal":
          "0 0 0 1px rgba(45,212,191,0.18), 0 16px 50px -18px rgba(45,212,191,0.34)",
        "card-hover": "0 28px 70px -28px rgba(0,0,0,0.8)",
      },
      backgroundImage: {
        mesh:
          "radial-gradient(60% 50% at 12% -5%, rgba(79,156,255,0.12), transparent 60%), radial-gradient(45% 45% at 100% 0%, rgba(45,212,191,0.10), transparent 55%)",
        "accent-gradient": "linear-gradient(135deg, #4f9cff 0%, #2dd4bf 100%)",
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
