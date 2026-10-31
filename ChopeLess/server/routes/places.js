// QueueLess: analyse a queue photo with OpenAI. Owner: M4
// Reading places and trends happens in the browser (client/src/services/places.js).
// This route exists because the OpenAI key must stay secret on the server.
import express, { Router } from 'express'
import { readdir, readFile } from 'fs/promises'
import { extname, join } from 'path'
import { fileURLToPath } from 'url'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../firebase.js'
import { analyseImage } from '../services/openai.js'

const router = Router()
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Sample queue photos for "See Live Queue" (stands in for a live camera at each place)
const LIVE_DIR = fileURLToPath(new URL('../../test_pictures/actual', import.meta.url))
const LIVE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
router.use('/live-photos', express.static(LIVE_DIR))

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
    // Reject photos the AI is sure are not of a food place, before anything is saved
    if (result.isFoodPlace === false) {
      return res.status(422).json({ error: "This doesn't look like a food place. Please upload a photo of the queue or seating area." })
    }
    delete result.isFoodPlace // don't store it in Firestore
    res.status(201).json(await saveEstimate(placeRef, result))
  } catch (err) { next(err) }
})

// See Live Queue: analyse a random sample photo as if it came from a camera at the place
router.post('/:id/live', async (req, res, next) => {
  try {
    if (tooMany(req)) return res.status(429).json({ error: 'Too many checks, please try again in a few minutes' })
    const placeRef = db.collection('places').doc(req.params.id)
    if (!(await placeRef.get()).exists) return res.status(404).json({ error: 'Place not found' })

    const files = (await readdir(LIVE_DIR)).filter(f => LIVE_TYPES[extname(f).toLowerCase()])
    const photo = files[Math.floor(Math.random() * files.length)]
    const imageBase64 = (await readFile(join(LIVE_DIR, photo))).toString('base64')
    const { isFoodPlace, ...result } = await analyseImage(imageBase64, LIVE_TYPES[extname(photo).toLowerCase()])
    res.status(201).json(await saveEstimate(placeRef, { ...result, photo }))
  } catch (err) { next(err) }
})

// Save an estimate: add it to the hourly history and make it the place's latest
async function saveEstimate(placeRef, result) {
  const at = new Date().toISOString()
  // Singapore hour, so the chart lines up even when the server runs in another time zone
  const hour = Number(new Date().toLocaleString('en-SG', { hour: 'numeric', hour12: false, timeZone: 'Asia/Singapore' })) % 24
  await placeRef.collection('analyses').add({ ...result, hour, createdAt: FieldValue.serverTimestamp() })
  await placeRef.update({ latest: { ...result, at } })
  return { ...result, at }
}

export default router
