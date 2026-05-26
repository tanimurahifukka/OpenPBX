import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#edf5fc',
          100: '#d4e8f8',
          200: '#a9d1f1',
          300: '#79b8e8',
          400: '#4897d8',
          500: '#3578b5',
          600: '#285d92',
          700: '#1e4770',
          800: '#15324f',
          900: '#0c1e30',
          DEFAULT: '#4897d8',
        },
        banana: {
          50: '#fffbeb',
          100: '#fff3c4',
          200: '#ffe88a',
          300: '#ffdb5c',
          400: '#f5c430',
          500: '#d9a600',
          DEFAULT: '#ffdb5c',
        },
        melon: {
          50: '#fef2f0',
          100: '#fde0db',
          200: '#fbc0b6',
          300: '#fa9e8e',
          400: '#fa6e59',
          500: '#e04a35',
          600: '#b83525',
          DEFAULT: '#fa6e59',
        },
        canteloupe: {
          50: '#fff7ed',
          100: '#ffead1',
          200: '#ffd4a3',
          300: '#f8a055',
          400: '#e88a35',
          500: '#c77020',
          DEFAULT: '#f8a055',
        },
      },
    },
  },
  plugins: [],
};

export default config;
