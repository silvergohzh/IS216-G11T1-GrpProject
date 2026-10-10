// QueueLess: analyse a queue photo with OpenAI. Owner: M4
// Reading places and trends happens in the browser (client/src/services/places.js).
// This route exists because the OpenAI key must stay secret on the server.
import { Router } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../firebase.js'
import { analyseImage } from '../services/openai.js'

const router = Router()
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Anyone can upload without logging in, so limit each visitor to a few photos
// to stop one person from using up our OpenAI credit. Resets when the server restarts.
const LIMIT = 10
const WINDOW_MS = 10 * 60 * 1000
const recent = new Map() // ip -> timestamps of recent uploads

function tooMany(req) {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim()
  const now = Date.now()
  const times = (recent.get(ip) || []).filter(t => now - t < WINDOW_MS)
  if (times.length >= LIMIT) return true
  recent.set(ip, [...times, now])
  return false
}

router.post('/:id/analyse', async (req, res, next) => {
  try {
    if (tooMany(req)) return res.status(429).json({ error: 'Too many photos, please try again in a few minutes' })
    const { imageBase64, mimeType = 'image/jpeg' } = req.body
    if (typeof imageBase64 !== 'string' || !imageBase64) return res.status(400).json({ error: 'Please choose a photo' })
    if (!IMAGE_TYPES.includes(mimeType)) return res.status(400).json({ error: 'Photo must be JPEG, PNG or WebP' })

    const placeRef = db.collection('places').doc(req.params.id)
    const snap = await placeRef.get()
    if (!snap.exists) return res.status(404).json({ error: 'Place not found' })

    const result = await analyseImage(imageBase64, mimeType)
    const at = new Date().toISOString()
    // Singapore hour, so the chart lines up even when the server runs in another time zone
    const hour = Number(new Date().toLocaleString('en-SG', { hour: 'numeric', hour12: false, timeZone: 'Asia/Singapore' })) % 24
    const analysis = { ...result, hour, createdAt: FieldValue.serverTimestamp() }

    await placeRef.collection('analyses').add(analysis)
    await placeRef.update({ latest: { ...result, at } })
    res.status(201).json({ ...result, at })
  } catch (err) { next(err) }
})

export default router
