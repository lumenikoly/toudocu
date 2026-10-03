/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  tabWidth: 2,
  proseWrap: 'always',
  overrides: [
    {
      files: ['*.json', '*.jsonc'],
      options: { singleQuote: false },
    },
  ],
};
