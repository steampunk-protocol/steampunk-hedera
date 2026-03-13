/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brass: '#b5a642',
        copper: '#b87333',
        'dark-iron': '#2a2a2e',
        steam: '#e8dcc8',
        'neon-green': '#39ff14',
      },
      fontFamily: {
        heading: ['"Press Start 2P"', 'monospace'],
        body: ['"Space Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
