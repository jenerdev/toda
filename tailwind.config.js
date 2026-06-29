/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0d9488',
          dark: '#0f766e',
          light: '#14b8a6',
        },
      },
    },
  },
  plugins: [],
}
