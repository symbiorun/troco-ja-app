import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ─── Design System: Frictionless Guardian ─────────────────────────────
      colors: {
        // Tokens extraídos dos stitch-pages (exatos)
        "primary":                  "#006b41",
        "primary-container":        "#0a8754",
        "primary-fixed":            "#8ff8ba",
        "primary-fixed-dim":        "#72dba0",
        "inverse-primary":          "#72dba0",
        "on-primary":               "#ffffff",
        "on-primary-fixed":         "#002111",
        "on-primary-fixed-variant": "#005231",
        "on-primary-container":     "#fffffb",

        "secondary":                "#0a629c",
        "secondary-container":      "#7dbefe",
        "secondary-fixed":          "#cfe5ff",
        "secondary-fixed-dim":      "#9acbff",
        "on-secondary":             "#ffffff",
        "on-secondary-container":   "#004c7c",
        "on-secondary-fixed":       "#001d34",
        "on-secondary-fixed-variant":"#004a78",

        "tertiary":                 "#7b5700",
        "tertiary-container":       "#9b6e00",
        "tertiary-fixed":           "#ffdea9",
        "tertiary-fixed-dim":       "#fcbb37",
        "on-tertiary":              "#ffffff",
        "on-tertiary-container":    "#ffffff",
        "on-tertiary-fixed":        "#271900",
        "on-tertiary-fixed-variant":"#5e4200",

        "surface":                  "#f7f9fc",
        "surface-bright":           "#f7f9fc",
        "surface-dim":              "#d8dadd",
        "surface-variant":          "#e0e3e6",
        "surface-tint":             "#006d42",
        "surface-container-lowest": "#ffffff",
        "surface-container-low":    "#f2f4f7",
        "surface-container":        "#eceef1",
        "surface-container-high":   "#e6e8eb",
        "surface-container-highest":"#e0e3e6",
        "on-surface":               "#191c1e",
        "on-surface-variant":       "#3e4941",
        "inverse-surface":          "#2d3133",
        "inverse-on-surface":       "#eff1f4",

        "outline":                  "#6e7a70",
        "outline-variant":          "#bdcabf",

        "background":               "#f7f9fc",
        "on-background":            "#191c1e",

        "error":                    "#ba1a1a",
        "error-container":          "#ffdad6",
        "on-error":                 "#ffffff",
        "on-error-container":       "#93000a",
      },

      borderRadius: {
        DEFAULT: "0.25rem",
        sm:      "0.125rem",
        md:      "0.375rem",
        lg:      "0.5rem",
        xl:      "0.75rem",
        "2xl":   "1rem",
        "3xl":   "1.5rem",
        full:    "9999px",
      },

      fontFamily: {
        headline: ["Plus Jakarta Sans", "sans-serif"],
        body:     ["Manrope", "sans-serif"],
        label:    ["Manrope", "sans-serif"],
        sans:     ["Manrope", "sans-serif"],
      },

      fontSize: {
        "display-lg":  ["3.5rem",  { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "800" }],
        "display-md":  ["2.75rem", { lineHeight: "1.2",  letterSpacing: "-0.02em", fontWeight: "800" }],
        "headline-lg": ["2rem",    { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "700" }],
        "headline-md": ["1.75rem", { lineHeight: "1.3",  letterSpacing: "-0.01em", fontWeight: "700" }],
        "headline-sm": ["1.5rem",  { lineHeight: "1.35", fontWeight: "700" }],
        "title-lg":    ["1.25rem", { lineHeight: "1.4",  fontWeight: "700" }],
        "title-md":    ["1rem",    { lineHeight: "1.5",  fontWeight: "700" }],
        "title-sm":    ["0.875rem",{ lineHeight: "1.5",  fontWeight: "600" }],
        "body-lg":     ["1rem",    { lineHeight: "1.6" }],
        "body-md":     ["0.875rem",{ lineHeight: "1.6" }],
        "body-sm":     ["0.75rem", { lineHeight: "1.5" }],
        "label-lg":    ["0.875rem",{ lineHeight: "1.4",  fontWeight: "600" }],
        "label-md":    ["0.75rem", { lineHeight: "1.4",  fontWeight: "600" }],
      },

      boxShadow: {
        // Blue-tinted shadow (brand)
        "card":  "0 8px 32px 0 rgba(10, 98, 156, 0.04)",
        "float": "0 4px 16px 0 rgba(10, 98, 156, 0.08)",
        "lift":  "0 16px 48px 0 rgba(10, 98, 156, 0.12)",
      },

      backgroundImage: {
        // Gradiente botão primário
        "primary-gradient": "linear-gradient(135deg, #006b41 0%, #0a8754 100%)",
        // Gradiente progress bar
        "progress-gradient": "linear-gradient(90deg, #006b41 0%, #72dba0 100%)",
      },

      animation: {
        "pulse-slow":    "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in":       "fadeIn 0.3s ease-in-out",
        "slide-up":      "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right":"slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        "bounce-gentle": "bounceGentle 1.5s ease-in-out infinite",
      },

      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%":   { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        bounceGentle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":       { transform: "translateY(-6px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
