// Checks who is calling the API, and what they are allowed to do. Owner: M6
// Works with both the real Firebase and the local Auth emulator.
import { adminAuth, db } from '../firebase.js'

// Step 1: is the user logged in?
// The browser sends its Firebase login token in the "Authorization" header.
// If the token is valid, we save the user's id on req.uid for the route to use.
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

// Every account has one role:
//   'diner'  - the default, for everyone who signs up
//   'hawker' - runs a stall, sees that stall's orders
//   'admin'  - can change other people's roles
// The role is saved in the user's profile: users/{uid}.role
// If there is no role saved yet, the user is a diner.
export async function getRole(uid) {
  const snap = await db.collection('users').doc(uid).get()
  const profile = snap.exists ? snap.data() : {}
  return {
    role: profile.role || 'diner',
    placeId: profile.placeId || null // only hawkers have this: the stall they run
  }
}

// Step 2: does the user have the right role?
// Use it after requireAuth, for example:
//   router.get('/board', requireAuth, requireRole('hawker'), ...)
// You can allow more than one role: requireRole('hawker', 'admin')
export function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const { role, placeId } = await getRole(req.uid)
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ error: 'You are not allowed to do this' })
      }
      // Save these so the route can use them (for example, which stall a hawker runs)
      req.role = role
      req.placeId = placeId
      next()
    } catch (err) {
      next(err)
    }
  }
}
