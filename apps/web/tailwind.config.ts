import type { Config } from 'tailwindcss';

// Design tokens — デジタル庁デザインシステム準拠の考え方:
//   - ベース UI は白 + gray (neutral) + 黒で構成
//   - 色はアクセント・状態表現にのみ使う
//   - primary (Electric Blue) はリンク・ボタン・フォーカスリングに限定
//   - success/warning/danger は状態バッジと StatusMessage のみ
//   - 背景に色を敷くのはサイドバーだけ (それ以外の面は白 or gray-50)

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary accent — リンク、ボタン、フォーカスリング
        primary: {
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
        // Semantic — 状態表現用 (バッジ・StatusMessage のみ)
        success: { light: '#e8f5e9', DEFAULT: '#2e7d32', dark: '#1b5e20' },
        warning: { light: '#fff8e1', DEFAULT: '#f9a825', dark: '#f57f17' },
        danger:  { light: '#ffeef0', DEFAULT: '#d32f2f', dark: '#b71c1c' },
        accent:  { light: '#fff3e0', DEFAULT: '#f8a055', dark: '#e65100' },
      },
    },
  },
  plugins: [],
};

export default config;
