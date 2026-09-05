// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'prisma/migrations'] },

  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /*
       * Nest leans on decorators and DI, so a few of the defaults fight the
       * framework rather than the code. These are the narrowest relaxations
       * that let idiomatic Nest through.
       */

      // Controllers legitimately return `void` handlers to Express.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],

      // `_` marks a parameter kept for signature shape, not forgotten.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],

      // Prisma and Redis hand back values the compiler cannot narrow; the
      // boundaries where that happens are explicit and reviewed.
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',

      // An async method with no await is a legitimate interface obligation.
      '@typescript-eslint/require-await': 'off',

      // Errors thrown across the request boundary are Nest exceptions.
      '@typescript-eslint/only-throw-error': 'off',
    },
  },

  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
