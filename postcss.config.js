/** @type {import('postcss').Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    "postcss-preset-env": {
      features: {
        "oklab-function": true,
        "color-mix": true,
        "custom-properties": false,
      }
    },
  },
};

export default config;
