/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        earth: {
          50: '#fdf8f0',
          100: '#fbecd8',
          200: '#f6d4a8',
          300: '#efb671',
          400: '#e79043',
          500: '#e17020',
          600: '#cc5618',
          700: '#a93f16',
          800: '#883219',
          900: '#6f2b16',
          950: '#3c1408',
        },
        sky: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#b9e6fd',
          300: '#7cd4fc',
          400: '#36bcf8',
          500: '#0ca2e9',
          600: '#0081c7',
          700: '#0167a2',
          800: '#065885',
          900: '#0b496e',
          950: '#072e49',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
