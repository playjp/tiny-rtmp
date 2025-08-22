
import { defineConfig, coverageConfigDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        ...coverageConfigDefaults.exclude,
        '**/*.js',
        '**/*.mjs',
        '**/index.mts',
      ],
    },
  },
});
