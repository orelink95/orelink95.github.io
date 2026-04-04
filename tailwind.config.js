/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./scripts/**/*.js",
    "./components/**/*.html",
    "./admin_tools/**/*.html"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "on-secondary-fixed": "#261900",
        "surface-container-high": "#292a28",
        "on-primary": "#1f3525",
        "on-error": "#690005",
        "inverse-primary": "#4c6451",
        "surface-container-highest": "#333533",
        "on-secondary": "#412d00",
        "on-error-container": "#ffdad6",
        "surface-dim": "#121412",
        "secondary-container": "#604403",
        "on-tertiary-fixed": "#28180b",
        "surface-bright": "#383a37",
        "secondary": "#e9c176",
        "on-tertiary-container": "#a88e7b",
        "tertiary-fixed": "#fbddc7",
        "surface": "#121412",
        "secondary-fixed-dim": "#e9c176",
        "on-background": "#e2e3df",
        "inverse-surface": "#e2e3df",
        "surface-container-lowest": "#0d0f0d",
        "outline": "#8d928b",
        "surface-container-low": "#1a1c1a",
        "tertiary-fixed-dim": "#dec1ac",
        "surface-tint": "#b3cdb6",
        "secondary-fixed": "#ffdea5",
        "on-surface": "#e2e3df",
        "surface-variant": "#333533",
        "outline-variant": "#434842",
        "on-primary-fixed": "#0a2011",
        "tertiary-container": "#39281a",
        "primary-fixed": "#cfe9d1",
        "on-primary-container": "#809983",
        "on-tertiary": "#3f2d1e",
        "primary-fixed-dim": "#b3cdb6",
        "surface-container": "#1e201e",
        "primary": "#b3cdb6",
        "on-secondary-fixed-variant": "#5d4201",
        "on-tertiary-fixed-variant": "#574333",
        "background": "#121412",
        "inverse-on-surface": "#2f312e",
        "primary-container": "#1a3020",
        "error-container": "#93000a",
        "tertiary": "#dec1ac",
        "error": "#ffb4ab",
        "on-secondary-container": "#dab36a",
        "on-surface-variant": "#c3c8c0",
        "on-primary-fixed-variant": "#354c3a"
      },
      fontFamily: {
        "headline": ["Noto Serif"],
        "body": ["Newsreader"],
        "label": ["Manrope"]
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-15px)' },
        },
        drift: {
          '0%': { transform: 'translateY(0) translateX(0) scale(1)', opacity: '0' },
          '20%': { opacity: '0.8' },
          '100%': { transform: 'translateY(-100px) translateX(40px) scale(1.5)', opacity: '0' },
        },
        glow: {
          '0%, 100%': { opacity: '1', textShadow: '0 0 20px rgba(233,193,118, 0.4)' },
          '50%': { opacity: '0.7', textShadow: '0 0 40px rgba(233,193,118, 0.8)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        }
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        drift: 'drift 8s linear infinite',
        glow: 'glow 4s ease-in-out infinite',
        'pulse-slow': 'pulse-slow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}

