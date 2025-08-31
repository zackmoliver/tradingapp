/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        slate: require("tailwindcss/colors").slate,
      },
    },
  },
  plugins: [],
};
