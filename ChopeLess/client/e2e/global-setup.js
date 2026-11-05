
// Loads sample places, menus and test accounts into the emulator.
// Owner: M6

import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

export default function globalSetup() {
  const serverDir = fileURLToPath(new URL('../../server', import.meta.url))

  const emulatorEnv = {
    ...process.env,
    FIREBASE_PROJECT_ID: 'demo-hiddengems',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099'
  }

  // Original seeding process — unchanged
  execSync('npm run seed', {
    cwd: serverDir,
    stdio: 'inherit',
    env: emulatorEnv
  })

  // [JANANI] START: Create authorized E2E crowd-report verifier
  execSync(
    `node --input-type=module -e "import { adminAuth } from './firebase.js'; try { await adminAuth.getUser('e2e-crowd-verifier') } catch (error) { if (error.code !== 'auth/user-not-found') throw error; await adminAuth.createUser({ uid: 'e2e-crowd-verifier', email: 'crowd-verifier@chopeless.test', password: 'test1234' }) }"`,
    {
      cwd: serverDir,
      stdio: 'inherit',
      env: emulatorEnv
    }
  )
  // [JANANI] END
}
