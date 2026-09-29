/** @type {import('tailwindcss').Config} */
const token = name => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        raised: token('raised'),
        line: token('line'),
        ink: token('ink'),
        muted: token('muted'),
        coral: token('coral'),
        orange: token('orange'),
        yellow: token('yellow'),
        navy: token('navy'),
        ash: token('ash'),
        ice: token('ice'),
        // Text-safe coral: meets 4.5:1 on the surface in both themes.
        'coral-ink': token('coral-ink'),
      },
      fontFamily: {
        display: ['"Quicksand Variable"', 'Quicksand', 'system-ui', 'sans-serif'],
        body: ['"Nunito Variable"', 'Nunito', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // 12 / 14 / 16 / 20 / 28 / 56
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['20px', { lineHeight: '26px' }],
        xl: ['28px', { lineHeight: '32px' }],
        hero: ['56px', { lineHeight: '56px', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        // The 8px "tail" corner points at what the element belongs to.
        card: '22px 8px 22px 22px',
        'card-lg': '28px 10px 28px 28px',
        btn: '18px 18px 18px 6px',
        field: '16px 6px 16px 16px',
      },
      boxShadow: {
        sticker: 'var(--sticker)',
        'sticker-sm': 'var(--sticker-sm)',
        lift: 'var(--lift)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        out: 'cubic-bezier(0.25, 1, 0.5, 1)',
      },
    },
  },
  plugins: [],
};
