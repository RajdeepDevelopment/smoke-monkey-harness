// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'plugin/**',
      'mcp-server/**',
      'scripts/**',
      'examples/**',
      'tests/**',
      '.github/**',
      '.agents/**',
      '.opencode/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      // Legacy code ships intentional empty blocks and escape sequences in
      // shell/command strings; keep them visible as warnings, not failures.
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
      'no-dupe-else-if': 'warn',
    },
  }
);