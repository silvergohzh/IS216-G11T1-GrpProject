// Checks the Firebase login token the browser sends. Owner: M6
// Works with both the real Firebase and the local Auth emulator.
import { adminAuth } from '../firebase.js'

export async function requireAuth(req, res, next) {
  const token = (req.header('authorization') || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Please log in' })
  try {
    const decoded = await adminAuth.verifyIdToken(token)
    req.uid = decoded.uid
    next()
  } catch {
    res.status(401).json({ error: 'Login expired, please log in again' })
  }
}
