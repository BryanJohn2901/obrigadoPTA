/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#000000',
          surface: '#000000',
          primary: '#F8C100',
          primaryHover: '#F8C100',
          accent: '#F8C100',
          textPrimary: '#FFFFFF',
          textSecondary: '#FFFFFF',
          textMuted: '#FFFFFF',
          darkgray: '#000000',
          success: '#F8C100',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['Oswald', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2.5s infinite linear',
        float: 'float 8s ease-in-out infinite',
        'float-delayed': 'float 10s ease-in-out infinite 2s',
        marquee: 'marquee 25s linear infinite',
        'check-pop': 'checkPop 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both',
        'ring-pulse': 'ringPulse 2.6s ease-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-30px) scale(1.05)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        checkPop: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '60%': { transform: 'scale(1.15)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        ringPulse: {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '80%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
    },
  },
  safelist: [
    'z-[100]',
    'z-[1]',
    'z-[2]',
    'bg-[#101010]/90',
    'bg-[#181818]',
    'bg-[#0066FF]',
    'bg-[#0066FF]/15',
    'bg-[#0052CC]',
    'bg-[#0052CC]/10',
    'text-[#0066FF]',
    'via-[#001433]/40',
    'hover:bg-[#0052CC]',
    'flex',
    'hidden',
    'animate-check-pop',
    'animate-ring-pulse',
  ],
  plugins: [],
};
