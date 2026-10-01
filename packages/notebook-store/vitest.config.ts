import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      sharp: path.resolve(__dirname, 'tests/mocks/empty-mock.js'),
    },
  },
  test: {
    testTimeout: 60000,
    hookTimeout: 60000,
    exclude: ['dist/**', 'node_modules/**'],
    server: {
      deps: {
        inline: ['@xenova/transformers'],
      },
    },
  },
});

