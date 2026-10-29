import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests-ts/**/*.test.ts'],
    setupFiles: ['tests-ts/setup.ts'],
    // chaque fichier a son DATA_DIR temporaire et ses modules neufs
    isolate: true,
    pool: 'forks',
  },
})
