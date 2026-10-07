/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["Outfit", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.04), 0 14px 34px -18px rgba(15,23,42,.25)",
        lift: "0 2px 6px rgba(15,23,42,.06), 0 28px 56px -24px rgba(15,23,42,.35)",
        glow: "0 10px 30px -12px rgba(16,185,129,.65)",
        "card-dark": "0 2px 4px rgba(2,6,23,.35), 0 30px 60px -24px rgba(2,6,23,.9), inset 0 1px 0 rgba(148,163,184,.08)",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        rise: {
          from: { opacity: "0", transform: "translateY(14px) scale(.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        toastIn: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fadeIn .2s ease-out both",
        rise: "rise .32s cubic-bezier(.16,1,.3,1) both",
        "toast-in": "toastIn .3s cubic-bezier(.16,1,.3,1) both",
      },
    },
  },
  plugins: [],
}
