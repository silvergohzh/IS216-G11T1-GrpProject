// Preview the shortlist without starting voting. Owner: M2
// Handy for testing the engine on its own: GET /api/shortlist/ABCDEF
import { Router } from 'express'
import { db } from '../firebase.js'
import { buildShortlist } from '../services/shortlist.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/:code', requireAuth, async (req, res, next) => {
  try {
    const snap = await db.collection('sessions').doc(req.params.code).get()
    if (!snap.exists) return res.status(404).json({ error: 'Session not found' })
    res.json(await buildShortlist(snap.data()))
  } catch (err) { next(err) }
})

export default router
