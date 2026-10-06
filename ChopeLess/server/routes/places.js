// QueueLess: analyse a queue photo with Gemini. Owner: M4
// Reading places and trends happens in the browser (client/src/services/places.js).
// This route exists because the Gemini key must stay secret on the server.
import { Router } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../firebase.js'
import { analyseImage } from '../services/gemini.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.post('/:id/analyse', requireAuth, async (req, res, next) => {
  try {
    const placeRef = db.collection('places').doc(req.params.id)
    const snap = await placeRef.get()
    if (!snap.exists) return res.status(404).json({ error: 'Place not found' })

    // TODO (M4): skip Gemini and reuse place.latest if it is less than 10 minutes old
    const result = await analyseImage(req.body.imageBase64)
    const analysis = { ...result, hour: new Date().getHours(), createdAt: FieldValue.serverTimestamp() }

    await placeRef.collection('analyses').add(analysis)
    await placeRef.update({ latest: { ...result, at: new Date().toISOString() } })
    res.status(201).json(result)
  } catch (err) { next(err) }
})

export default router
