/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{html,js,py}',
    './src/**/templates/**/*.html',
    './.venv/lib/python*/site-packages/unfold/templates/**/*.html',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
