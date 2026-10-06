// Connects the server to Firebase with full admin access. Owner: M6
// The server is trusted, so it skips the Security Rules. Only do things here that
// the browser must NOT be allowed to do itself (start voting, decide the winner, call Gemini).
import 'dotenv/config'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID,
  ...(serviceAccount ? { credential: cert(JSON.parse(serviceAccount)) } : {})
})

export const db = getFirestore()
export const adminAuth = getAuth()
