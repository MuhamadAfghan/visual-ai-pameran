/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Titillium Web", "Segoe UI", "sans-serif"],
      },
      colors: {
        surface: {
          base: "var(--surface-base)",
          panel: "var(--surface-panel)",
          elevated: "var(--surface-elevated)",
          border: "var(--surface-border)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          dim: "var(--primary-dim)",
          fg: "var(--primary-fg)",
        },
        content: {
          DEFAULT: "var(--content)",
          secondary: "var(--content-secondary)",
          muted: "var(--content-muted)",
        },
      },
    },
  },
  plugins: [],
};
