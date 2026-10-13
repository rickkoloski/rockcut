import { defineConfig } from 'vitest/config'

// D38: unit tests for pure logic only (the drag layer's move model).
// Kept apart from vite.config.ts so the PWA plugin doesn't load for tests.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
