module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // Prevent importing from @tauri-apps/api/tauri and enforce centralized imports
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@tauri-apps/api/tauri',
            message: 'Use @tauri-apps/api/core instead. Import invoke from src/lib/tauri.ts for centralized handling.',
          },
        ],
        patterns: [
          {
            group: ['@tauri-apps/api/core'],
            message: 'Import invoke from src/lib/tauri.ts for centralized handling instead of direct @tauri-apps/api/core imports.',
            allowTypeImports: true,
          },
        ],
      },
    ],
    // Enforce consistent date formatting
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.name="format"][arguments.1.value!="MM/dd/yyyy"]',
        message: 'Use MM/dd/yyyy format for dates. Import from src/lib/date.ts for consistent formatting.',
      },
    ],
  },
};
