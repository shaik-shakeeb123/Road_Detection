/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          bg: '#090A0F',
          sidebar: '#14151B',
          card: '#18181C',
          cardHover: '#202127',
          border: '#2B2D35',
          borderLight: '#3E424E',
          text: '#F5F5F5',
          muted: '#767881',
          lime: '#E0EA6C',
          blue: '#6989FF',
          cyan: '#38BDF8',
          amber: '#F59E0B',
          red: '#FF5C5C',
        },
      },
      fontFamily: {
        sans: ['Lato', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
