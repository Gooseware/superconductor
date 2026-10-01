import { defineConfig, configDefaults } from 'vitest/config';
import fs from 'fs';

const caduceusExists = fs.existsSync('/home/gooseware/repos/hippos/caduceus');

export default defineConfig({
  test: {
    pool: 'forks',
    exclude: [
      ...configDefaults.exclude,
      ...(!caduceusExists ? ['tests/Phase4Bridge.test.ts', 'tests/Phase8E2E.test.ts'] : [])
    ]
  }
});
