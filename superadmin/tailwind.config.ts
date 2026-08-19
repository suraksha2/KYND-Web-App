import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['var(--font-heading)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Core Palette
        warmlinen: '#F5F1EA',
        terracotta: '#A95F45',
        sage: '#7A8D72',
        charcoal: '#2B2926',
        lightstone: '#D6CEC2',
        warmgrey: '#70685E',

        // Pink Accent Options (for tertiary use only)
        dustyrose: '#C58A8A',
        desertrose: '#B97B7B',
        blushclay: '#D2A2A0',
        mutedmauve: '#A8848A',
        rosewood: '#99636A',

        // Terracotta accent ramp
        accent: {
          50: '#FDF5F2',
          100: '#FCECE6',
          200: '#F5D0C0',
          300: '#EAB098',
          400: '#D88A75',
          500: '#A95F45', // Primary terracotta
          600: '#8B4D3A',
          700: '#6E3F2F',
          800: '#513324',
          900: '#342719',
        },

        // Legacy colors for compatibility
        cream: '#F5F1EA',
        oat: '#E7DED1',

        // Keep the old sidebar key if any code still references it
        sidebar: "#0f172a",
        "sidebar-hover": "#1e293b",
      },
      boxShadow: {
        soft: '0 10px 30px -10px rgba(74, 46, 31, 0.18)',
      },
    },
  },
  plugins: [],
};
export default config;
