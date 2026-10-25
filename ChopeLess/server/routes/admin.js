// Admin tools: hawker applications, every account, and changing roles. Owner: M6
// Only admins can use these routes (see requireRole in middleware/auth.js).
import { Router } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { db, adminAuth } from '../firebase.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()
const ROLES = ['diner', 'hawker', 'admin']
const applications = db.collection('hawkerApplications')

// Every route in this file needs a logged-in admin
router.use(requireAuth, requireRole('admin'))

// ---------- Hawker applications ----------

// GET /api/admin/applications - applications waiting for a decision
router.get('/applications', async (req, res, next) => {
  try {
    const snap = await applications.where('status', '==', 'pending').get()
    res.json(snap.docs.map(d => d.data()))
  } catch (err) {
    next(err)
  }
})

// APPROVE: POST /api/admin/applications/:uid/approve
// Creates the real stall in places/{id} (empty menu), and makes the applicant its hawker.
// From now on the stall shows up everywhere: QueueLess, the voting shortlist and pre-orders.
router.post('/applications/:uid/approve', async (req, res, next) => {
  try {
    const appRef = applications.doc(req.params.uid)
    const snap = await appRef.get()
    if (!snap.exists || snap.data().status !== 'pending') {
      return res.status(404).json({ error: 'No pending application for this user' })
    }
    const a = snap.data()

    // The same fields as the seeded places (server/seed/places.json), so every page can use it
    const placeRef = await db.collection('places').add({
      name: a.stallName,
      cuisine: a.cuisine,
      address: a.address,
      lat: a.lat,
      lng: a.lng,
      priceMin: 0,
      priceMax: 0,
      dietary: a.dietary,
      serviceModes: a.serviceModes,
      menu: [],
      latest: null,          // no queue estimate yet
      ownerUid: a.uid,
      createdAt: FieldValue.serverTimestamp()
    })

    // The applicant becomes the hawker of that stall
    await db.collection('users').doc(a.uid).set({ name: a.applicantName, role: 'hawker', placeId: placeRef.id }, { merge: true })
    await appRef.update({ status: 'approved', placeId: placeRef.id, decidedAt: Date.now() })

    res.json({ placeId: placeRef.id })
  } catch (err) {
    next(err)
  }
})

// REJECT: POST /api/admin/applications/:uid/reject   body: { reason }
router.post('/applications/:uid/reject', async (req, res, next) => {
  try {
    const appRef = applications.doc(req.params.uid)
    const snap = await appRef.get()
    if (!snap.exists || snap.data().status !== 'pending') {
      return res.status(404).json({ error: 'No pending application for this user' })
    }
    const reason = String(req.body.reason || '').trim() || 'No reason given'
    await appRef.update({ status: 'rejected', reason: reason, decidedAt: Date.now() })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// ---------- Accounts and roles ----------

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
