import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
export default [
  { ignores: ['node_modules/**', 'client/dist/**', '.local/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser }, parserOptions: { ecmaFeatures: { jsx: true } } } },
  { files: ['client/**/*.{js,jsx}'], plugins: { react }, rules: { 'react/jsx-uses-vars': 'error', 'react/jsx-uses-react': 'off' } },
  { rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] } }
];
