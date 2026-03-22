/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brass: '#c4952a',
        copper: '#8b6914',
        'dark-iron': '#0f0f13',
        steam: '#e8dcc8',
        'neon-green': '#22c55e',
      },
      fontFamily: {
        heading: ['Cinzel', '"Press Start 2P"', 'serif'],
        body: ['"Space Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
