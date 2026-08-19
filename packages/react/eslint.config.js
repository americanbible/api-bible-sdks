import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Flat config for the React SDK. Type-unaware (fast) typescript-eslint recommended
// plus the react-hooks rules — `exhaustive-deps` is what the `eslint-disable`
// directives in provider.tsx / use-async-resource.ts opt out of, so wiring the
// linter up is what makes those opt-outs meaningful.
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Shipped code carries no stray console statements; the provider's two
    // intentional dev-only warnings opt out explicitly with an inline disable
    // (which this rule is what makes meaningful). Tests spy on console freely.
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-console': 'error' },
  },
);
