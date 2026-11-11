import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#F5F6FA',
        surface: '#FFFFFF',
        foreground: '#111827',
        card: {
          DEFAULT: '#FFFFFF',
          foreground: '#111827',
        },
        popover: {
          DEFAULT: '#FFFFFF',
          foreground: '#111827',
        },
        primary: {
          DEFAULT: '#4F46E5', // Indigo primary
          hover: '#4338CA',
          soft: '#EEF2FF',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#F3F4F6',
          hover: '#E5E7EB',
          foreground: '#1F2937',
        },
        muted: {
          DEFAULT: '#F3F4F6',
          foreground: '#6B7280',
        },
        accent: {
          DEFAULT: '#EEF2FF',
          foreground: '#4F46E5',
        },
        destructive: {
          DEFAULT: '#EF4444',
          hover: '#DC2626',
          foreground: '#FFFFFF',
        },
        border: '#E5E7EB',
        input: '#E5E7EB',
        ring: '#4F46E5',
        // Status colors STRICTLY RESERVED for restaurant entity state
        status: {
          free: '#16A34A',
          'free-soft': '#DCFCE7',
          'free-border': '#86EFAC',
          occupied: '#DC2626',
          'occupied-soft': '#FEE2E2',
          'occupied-border': '#FCA5A5',
          warning: '#D97706',
          'warning-soft': '#FEF3C7',
          info: '#2563EB',
          'info-soft': '#DBEAFE',
        },
      },
      borderRadius: {
        '2xl': '1rem',      // 16px cards
        xl: '0.75rem',      // 12px buttons/inputs
        lg: '0.5rem',       // 8px
        md: '0.375rem',     // 6px
        sm: '0.25rem',      // 4px
        full: '9999px',     // chips
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'card-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04)',
      },
      minHeight: {
        touch: '48px',
        'touch-lg': '56px',
        'touch-xl': '64px',
      },
      minWidth: {
        touch: '48px',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-subtle': 'pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
