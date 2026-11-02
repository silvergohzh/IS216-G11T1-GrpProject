// Vitest settings for the unit and component tests. Owner: M3 (Silver)
// Run: npm run test:vitest
// - environment 'jsdom' = a pretend browser page, so Vue components can be mounted without opening Chrome
// - only files inside __tests__ folders are run (the e2e folder is Playwright's, not Vitest's)
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/*.spec.js']
  }
})