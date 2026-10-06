// E2E test setup. Owner: M6. Each member adds their own spec file in e2e/.
// Run with:  npm run test:e2e
// That command starts the Firebase emulators first, so tests use a fresh, local database every time.
import { defineConfig, devices } from '@playwright/test'

const emulatorEnv = {
  FIREBASE_PROJECT_ID: 'demo-hiddengems',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099'
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js',
  workers: 1, // tests share one emulator database
  use: { baseURL: 'http://localhost:5174' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 } } } // iPhone 6 size
  ],
  // Test copies of the website and API run on ports 5174 and 3001, so they never touch your dev servers.
  webServer: [
    {
      command: 'npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      env: { VITE_USE_EMULATOR: 'true', VITE_FIREBASE_PROJECT_ID: 'demo-hiddengems', VITE_FIREBASE_API_KEY: 'demo-key', VITE_API_URL: 'http://localhost:3001/api' }
    },
    {
      command: 'node index.js',
      cwd: '../server',
      url: 'http://localhost:3001/api/health',
      env: { ...emulatorEnv, PORT: '3001', CLIENT_URL: 'http://localhost:5174' }
    }
  ]
})
