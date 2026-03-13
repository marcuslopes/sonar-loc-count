/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f1923',
        card: '#1a2b3c',
        accent: '#f7941d',
        'text-primary': '#e2e8f0',
        'text-muted': '#94a3b8',
      },
    },
  },
  plugins: [],
}
