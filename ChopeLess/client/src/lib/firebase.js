// Firebase setup: login (Auth) and database (Firestore). Owner: M6
// With VITE_USE_EMULATOR=true everything runs on your own laptop. No real Firebase project needed.
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'

const env = import.meta.env
const realKey = env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_API_KEY !== 'demo-key'

// Use the emulator unless .env says VITE_USE_EMULATOR=false AND gives a real API key.
// (Without this, a missing .env sends "demo-key" to the real Firebase and sign-up fails.)
export const usingEmulator = env.VITE_USE_EMULATOR !== 'false' || !realKey

const app = initializeApp({
  apiKey: usingEmulator ? 'demo-key' : env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: usingEmulator ? (env.VITE_FIREBASE_PROJECT_ID || 'demo-hiddengems') : env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID
})

export const auth = getAuth(app)
export const db = getFirestore(app)

if (usingEmulator) console.info('[Firebase] Using the local emulator (Auth :9099, Firestore :8080)')
else console.info('[Firebase] Using the real project:', env.VITE_FIREBASE_PROJECT_ID)

if (usingEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
