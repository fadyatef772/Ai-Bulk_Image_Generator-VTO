import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * Design system from the AI Bulk Image Generator spec.
 * Colors are exposed both as semantic Tailwind tokens and CSS variables.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Core surfaces
        background: '#020B24',
        sidebar: '#050F2F',
        card: '#091632',
        // Text
        'text-primary': '#F8FAFC',
        'text-secondary': '#7C8AA5',
        // Brand
        primary: {
          DEFAULT: '#0EA5E9', // primary blue (cyan)
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
        },
        secondary: {
          DEFAULT: '#3B82F6', // secondary blue
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
        },
        // Status
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
      borderColor: {
        DEFAULT: 'rgba(80,120,255,0.15)',
        glow: 'rgba(80,120,255,0.15)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Spec typography scale
        dashboard: ['40px', { lineHeight: '1.1', fontWeight: '700' }],
        section: ['24px', { lineHeight: '1.2', fontWeight: '600' }],
        stat: ['42px', { lineHeight: '1', fontWeight: '700' }],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(80,120,255,0.15), 0 8px 30px -12px rgba(14,165,233,0.25)',
        'glow-active': '0 0 0 1px rgba(14,165,233,0.45), 0 0 24px -6px rgba(14,165,233,0.45)',
        card: '0 10px 40px -20px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'sidebar-gradient': 'linear-gradient(180deg, #061235 0%, #050F2F 100%)',
        'app-gradient':
          'radial-gradient(1200px 600px at 80% -10%, rgba(14,165,233,0.10), transparent 60%), radial-gradient(900px 500px at 0% 110%, rgba(59,130,246,0.08), transparent 55%)',
        'logo-gradient': 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
      },
    },
  },
  plugins: [animate],
};

export default config;
