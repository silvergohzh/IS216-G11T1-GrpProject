// Loads the sample places into the emulator before the tests run. Owner: M6
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

export default function globalSetup() {
  execSync('node seed/seed.js', {
    cwd: fileURLToPath(new URL('../../server', import.meta.url)),
    stdio: 'inherit',
    env: { ...process.env, FIREBASE_PROJECT_ID: 'demo-hiddengems', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }
  })
}
