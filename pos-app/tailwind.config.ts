import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 18px 50px rgba(99, 102, 241, 0.22)'
      }
    }
  },
  plugins: []
} satisfies Config
