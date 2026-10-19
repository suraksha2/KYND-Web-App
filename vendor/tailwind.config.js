/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['"Sora"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        // Core Palette
        warmlinen: '#F5F1EA',
        terracotta: '#A95F45',
        sage: '#7A8D72',
        charcoal: '#2B2926',
        lightstone: '#D6CEC2',
        warmgrey: '#70685E',

        // Destructive/error states — distinct from terracotta so "danger"
        // (late jobs, issues) never reads as just another accent colour.
        danger: '#B3261E',

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
          900: '#342719'
        },

        cream: '#F5F1EA',
        oat: '#E7DED1'
      },
      boxShadow: {
        soft: '0 10px 30px -10px rgba(74, 46, 31, 0.18)'
      }
    }
  },
  plugins: []
}
