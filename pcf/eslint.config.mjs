import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['out/**', 'node_modules/**', '**/app/**', '**/generated/**', '**/types/**'] },
  ...tseslint.configs.recommended,
  { files: ['**/*.ts'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
);
