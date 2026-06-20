import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'fonti-primary': 'rgb(var(--fonti-primary-rgb) / <alpha-value>)',
        'fonti-primary-hover': 'rgb(var(--fonti-primary-hover-rgb) / <alpha-value>)',
        'fonti-accent': 'rgb(var(--fonti-accent-rgb) / <alpha-value>)',
        'fonti-accent-hover': 'rgb(var(--fonti-accent-hover-rgb) / <alpha-value>)',
        'fonti-surface-warm': 'var(--fonti-surface-warm)',
        'fonti-surface-accent': 'var(--fonti-surface-accent)',
        'fonti-surface-muted': 'var(--fonti-surface-muted)',
        'fonti-table-warm': 'var(--fonti-table-warm)',
        success: 'rgb(var(--success-rgb) / <alpha-value>)',
        warning: 'rgb(var(--warning-rgb) / <alpha-value>)',
        danger: 'rgb(var(--danger-rgb) / <alpha-value>)',
        info: 'rgb(var(--info-rgb) / <alpha-value>)',
        'card-hover': 'var(--card-hover)',
        'border-light': 'var(--border-light)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'sidebar-background': 'var(--sidebar-background)',
        'sidebar-text': 'var(--sidebar-text)',
        'table-header': 'var(--table-header)',
        'table-row-hover': 'var(--table-row-hover)',
        'input-background': 'var(--input-background)',
        'input-border': 'var(--input-border)',
        'input-focus': 'var(--input-focus)',
        'brand-dark':  'rgb(var(--fonti-primary-rgb) / <alpha-value>)',
        'brand-gold':  'rgb(var(--fonti-accent-rgb) / <alpha-value>)',
        'brand-cream': 'rgb(var(--fonti-accent-hover-rgb) / <alpha-value>)',
        'brand-white': 'hsl(var(--card))',
        border:      'hsl(var(--border))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
