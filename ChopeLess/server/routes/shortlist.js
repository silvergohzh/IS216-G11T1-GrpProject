// Preview the shortlist without starting voting. Owner: M2
// Handy for testing the engine on its own: GET /api/shortlist/ABCDEF
import { Router } from 'express'
import { db } from '../firebase.js'
import { buildShortlist } from '../services/shortlist.js'
import { walkingRoute } from '../services/osrm.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/:code', requireAuth, async (req, res, next) => {
  try {
    const snap = await db.collection('sessions').doc(req.params.code).get()
    if (!snap.exists) return res.status(404).json({ error: 'Session not found' })
    res.json(await buildShortlist(snap.data()))
  } catch (err) { next(err) }
})

// Walking route from the meeting point to the winner, for the winner map: GET /api/shortlist/ABCDEF/route
router.get('/:code/route', requireAuth, async (req, res, next) => {
  try {
    const snap = await db.collection('sessions').doc(req.params.code).get()
    if (!snap.exists) return res.status(404).json({ error: 'Session not found' })
    const { meetingPoint, winner } = snap.data()
    if (!meetingPoint?.lat || !winner) return res.json({ route: [] })
    res.json({ route: await walkingRoute(meetingPoint, winner) })
  } catch (err) { next(err) }
})

export default router
