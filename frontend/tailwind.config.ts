import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        primary: {
          50: '#f0f5ff',
          100: '#e0ecff',
          200: '#c2d9ff',
          300: '#94bbff',
          400: '#5d94ff',
          500: '#007AFF',
          600: '#006adb',
          700: '#0055b3',
          800: '#004494',
          900: '#003375',
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        'apple': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        'apple-md': '0 4px 14px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.04)',
        'apple-lg': '0 10px 30px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)',
        'apple-xl': '0 20px 60px rgba(0,0,0,0.1), 0 8px 20px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
