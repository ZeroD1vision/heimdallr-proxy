import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-syne)', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        jost: ['Jost', 'sans-serif'],
        jakarta: ['Plus Jakarta Sans', 'sans-serif'],
      },
      fontSize: {
        // Микро-подписи - строго для капса
        'ui-nano': ['10px', { lineHeight: '12px', letterSpacing: '0.15em' }],
        
        // Второстепенный UI - фильтры, счетчики, метаданные
        'ui-xs': ['11px', { lineHeight: '14px', letterSpacing: '0.1em' }],
        
        // Стандартный интерфейсный шрифт - кнопки, инпуты, логи
        'ui-sm': ['13px', { lineHeight: '18px', letterSpacing: '0.02em' }],
        
        // Читабельный текст / крупные лейблы
        'ui-md': ['15px', { lineHeight: '22px' }],
        
        // Крупные акценты и подзаголовки
        'ui-lg': ['18px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
      },
      colors: {
        void: '#000000',
        surface: 'rgba(255,255,255,0.03)',
        border: 'rgba(255,255,255,0.08)',
        accent: '#00ff88',
        danger: '#ff3b5c',
        muted: 'rgba(255,255,255,0.35)',
      },
      backdropBlur: {
        glass: '24px',
        'refraction-glass': '32px',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease forwards',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        scan: 'scan 4s linear infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scan: {
          from: { transform: 'translateY(-100%)' },
          to: { transform: 'translateY(400%)' },
        },
      },
        maxWidth: {
        '8xl': '90rem', // 1440px
        '9xl': '100rem', // 1600px
        'ultrawide': '120rem', // 1920px
      },
    },
  },
  plugins: [],
};

export default config;
