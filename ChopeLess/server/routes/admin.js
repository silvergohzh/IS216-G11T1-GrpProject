// Admin tools: see every account and change roles. Owner: M6
// Only admins can use these routes (see requireRole in middleware/auth.js).
import { Router } from 'express'
import { db, adminAuth } from '../firebase.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()
const ROLES = ['diner', 'hawker', 'admin']

// Every route in this file needs a logged-in admin
router.use(requireAuth, requireRole('admin'))

// GET /api/admin/users - every account with its email, name and role
router.get('/users', async (req, res, next) => {
  try {
    // Emails live in Firebase Auth, names and roles live in Firestore, so we read both
    const authResult = await adminAuth.listUsers(1000)
    const users = []
    for (const account of authResult.users) {
      const snap = await db.collection('users').doc(account.uid).get()
      const profile = snap.exists ? snap.data() : {}
      users.push({
        uid: account.uid,
        email: account.email,
        name: profile.name || '',
        role: profile.role || 'diner',
        placeId: profile.placeId || null
      })
    }
    res.json(users)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/users/:uid - change someone's role
// Body: { role: 'hawker', placeId: 'albert-centre' }   (placeId is only needed for hawkers)
router.patch('/users/:uid', async (req, res, next) => {
  try {
    const { role, placeId } = req.body

    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role must be diner, hawker or admin' })
    }
    // Stops an admin from accidentally locking themselves out
    if (req.params.uid === req.uid) {
      return res.status(400).json({ error: 'You cannot change your own role' })
    }
    // A hawker must be linked to a real stall
    if (role === 'hawker') {
      const place = await db.collection('places').doc(placeId || 'none').get()
      if (!place.exists) return res.status(400).json({ error: 'Choose the stall this hawker runs' })
    }

    await db.collection('users').doc(req.params.uid).set({
      role: role,
      placeId: role === 'hawker' ? placeId : null
    }, { merge: true })

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
