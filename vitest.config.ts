import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'apps/**/*.spec.ts',
      'apps/**/*.spec.tsx',
      'packages/**/*.spec.ts',
      'packages/**/*.spec.tsx',
    ],
  },
});
