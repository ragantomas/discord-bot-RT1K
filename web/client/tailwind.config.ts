import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      width: {
        68: '17rem',
      },
      colors: {
        bg: {
          base: '#0d1017',
          surface: '#151a24',
          elevated: '#1c2230',
          hover: '#242c3d',
        },
        brand: {
          DEFAULT: '#5865F2',
          hover: '#4752C4',
          gold: '#F5A623',
        },
      },
    },
  },
  plugins: [],
};

export default config;
