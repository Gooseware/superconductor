import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    testTimeout: 60000,
    hookTimeout: 60000,
    exclude: ['dist/**', 'node_modules/**'],
    alias: {
      sharp: path.resolve(__dirname, 'tests/mocks/empty-mock.js'),
    },
  },
});
