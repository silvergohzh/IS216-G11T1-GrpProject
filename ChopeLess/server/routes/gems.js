// Hidden Gems API  : M5
// Firestore: gems/{id} { name, mustTry, cuisine, address, lat, lng, priceMin, priceMax, dietary,
//                        serviceModes, waitMins, submittedBy, upvoters: [uid], createdAt }
// A gem with UPVOTES_NEEDED upvoters is copied into "places" as gem-<id>, in the same shape as the seeded places.

import { Router } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { db, adminAuth } from '../firebase.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const gems = db.collection('gems')
const places = db.collection('places')
const UPVOTES_NEEDED = 3
const DIETARY = ['halal', 'vegetarian']
const SERVICE_MODES = ['dine-in', 'takeaway']


// Makes an error with an HTTP status code. The shared handler in index.js sends it to the browser.
const httpError = (status, msg) => Object.assign(new Error(msg), { status })


// Check and clean the data the form sends. Used by both submit and edit.
// A gem must have everything a place needs, so it can join the voting pool.
function parseGem(body) {
  const { name, mustTry, cuisine, address, lat, lng, priceMin, priceMax, dietary, serviceModes, waitMins } = body

  if (!name?.trim()) throw httpError(400, 'Name is required')
  if (!cuisine?.trim()) throw httpError(400, 'Cuisine is required')
  if (!address?.trim()) throw httpError(400, 'Address is required')

  const min = Number(priceMin)
  const max = Number(priceMax)
  if (priceMin === '' || priceMax === '' || priceMin == null || priceMax == null ||
      !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
    throw httpError(400, 'Enter a valid price range (min is 0 or more, max is not below min)')
  }

  const wait = Number(waitMins)
  if (waitMins === '' || waitMins == null || !Number.isFinite(wait) || wait < 0 || wait > 180) {
    throw httpError(400, 'Enter the typical wait in minutes (0 to 180)')
  }

  const modes = Array.isArray(serviceModes) ? serviceModes.filter(m => SERVICE_MODES.includes(m)) : []
  if (!modes.length) throw httpError(400, 'Pick dine-in, takeaway or both')

  const latNum = Number(lat)
  const lngNum = Number(lng)
  if (lat == null || lat === '' || lng == null || lng === '' ||
      !Number.isFinite(latNum) || !Number.isFinite(lngNum) ||
      Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) {
    throw httpError(400, 'Pick the location on the map (valid latitude and longitude required)')
  }

  return {
    name: name.trim(),
    mustTry: mustTry?.trim() || '',
    cuisine: cuisine.trim(),
    address: address.trim(),
    lat: latNum,
    lng: lngNum,
    priceMin: min,
    priceMax: max,
    dietary: Array.isArray(dietary) ? dietary.filter(d => DIETARY.includes(d)) : [],
    serviceModes: modes,
    waitMins: wait
  }
}

// ---- Joining the voting pool = a copy of the gem in "places" (same fields as places.json) ----

// Old test gems may be missing the newer fields. Only complete gems can become places.
const isComplete = g =>
  g.lat != null && g.lng != null && !!g.address && !!g.cuisine &&
  g.priceMin != null && g.priceMax != null && g.waitMins != null && !!g.serviceModes?.length

const placeRefOf = id => places.doc(`gem-${id}`)

// The fixed details of a place
const placeBase = (id, g) => ({
  name: g.name,
  description: g.mustTry || '',
  cuisine: g.cuisine,
  address: g.address,
  lat: g.lat,
  lng: g.lng,
  priceMin: g.priceMin,
  priceMax: g.priceMax,
  dietary: g.dietary || [],
  serviceModes: g.serviceModes,
  fromGem: true,
  gemId: id
})

// The wait-time snapshot, same shape the seed script writes
const placeLatest = g => ({
  latest: {
    peopleInQueue: Math.round(g.waitMins / 0.8),
    waitMins: g.waitMins,
    seatOccupancy: Math.min(100, g.waitMins * 6),
    confidence: 'low',
    at: new Date().toISOString()
  }
})

// GET /api/gems - list gems, most upvoted first
router.get('/', async (req, res, next) => {
  try {
    const snap = await gems.get()
    const list = snap.docs.map(d => {
      const data = d.data()
      const upvoteCount = (data.upvoters || []).length
      return { id: d.id, ...data, upvoteCount, inPool: upvoteCount >= UPVOTES_NEEDED }
    })
    list.sort((a, b) => b.upvoteCount - a.upvoteCount)
    res.json(list)
  } catch (err) {
    next(err)
  }
})

// POST /api/gems - submit a new gem (login required)
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const gem = {
      ...parseGem(req.body),
      submittedBy: req.uid,
      upvoters: [],
      createdAt: FieldValue.serverTimestamp()
    }
    const ref = await gems.add(gem)
    res.status(201).json({ id: ref.id })
  } catch (err) {
    next(err)
  }
})

// PUT /api/gems/:id - edit your own gem (login required)
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const ref = gems.doc(req.params.id)
    const doc = await ref.get()
    if (!doc.exists) throw httpError(404, 'Gem not found')
    if (doc.data().submittedBy !== req.uid) throw httpError(403, 'You can only edit your own gems')

    const data = parseGem(req.body)
    await ref.update(data)

    // If the gem is already in the voting pool, keep its place in sync
    const merged = { ...doc.data(), ...data }
    if ((merged.upvoters || []).length >= UPVOTES_NEEDED && isComplete(merged)) {
      const placeRef = placeRefOf(ref.id)
      const exists = (await placeRef.get()).exists
      const fields = exists ? placeBase(ref.id, merged) : { ...placeBase(ref.id, merged), ...placeLatest(merged) }
      await placeRef.set(fields, { merge: true })
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/gems/:id - delete your own gem (login required)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const ref = gems.doc(req.params.id)
    const doc = await ref.get()
    if (!doc.exists) throw httpError(404, 'Gem not found')
    if (doc.data().submittedBy !== req.uid) throw httpError(403, 'You can only delete your own gems')
    await db.recursiveDelete(ref)
    await placeRefOf(ref.id).delete()   // also remove it from the voting pool
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/gems/:id/upvote - one vote per user (login required)
router.post('/:id/upvote', requireAuth, async (req, res, next) => {
  try {
    const ref = gems.doc(req.params.id)
    const upvoteCount = await db.runTransaction(async (t) => {
      const doc = await t.get(ref)
      if (!doc.exists) throw httpError(404, 'Gem not found')
      const g = doc.data()
      const upvoters = g.upvoters || []
      if (upvoters.includes(req.uid)) throw httpError(409, 'You already upvoted this gem')

      const newCount = upvoters.length + 1
      t.update(ref, { upvoters: FieldValue.arrayUnion(req.uid) })
      // The vote that reaches the threshold copies the gem into "places"
      if (newCount === UPVOTES_NEEDED && isComplete(g)) {
        t.set(placeRefOf(ref.id), { ...placeBase(ref.id, g), ...placeLatest(g) })
      }
      return newCount
    })
    res.json({ ok: true, upvoteCount, inPool: upvoteCount >= UPVOTES_NEEDED })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/gems/:id/upvote - take back your upvote (login required)
router.delete('/:id/upvote', requireAuth, async (req, res, next) => {
  try {
    const ref = gems.doc(req.params.id)
    const upvoteCount = await db.runTransaction(async (t) => {
      const doc = await t.get(ref)
      if (!doc.exists) throw httpError(404, 'Gem not found')
      const upvoters = doc.data().upvoters || []
      if (!upvoters.includes(req.uid)) throw httpError(409, "You haven't upvoted this gem")

      const newCount = upvoters.length - 1
      t.update(ref, { upvoters: FieldValue.arrayRemove(req.uid) })
      // Dropping below the threshold takes it out of the voting pool
      if (newCount < UPVOTES_NEEDED) t.delete(placeRefOf(ref.id))
      return newCount
    })
    res.json({ ok: true, upvoteCount, inPool: upvoteCount >= UPVOTES_NEEDED })
  } catch (err) {
    next(err)
  }
})

// ---- Reviews: gems/{id}/reviews/{uid} { text, rating, authorName, createdAt, editedAt } ----
// The review's ID is the author's uid, so each user has at most one review per gem.

// Check and clean a review. Used by post and edit.
function parseReview(body) {
  const text = String(body.text ?? '').trim()
  const rating = Number(body.rating)
  if (!text) throw httpError(400, 'Write a short review')
  if (text.length > 300) throw httpError(400, 'Review is too long (max 300 characters)')
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError(400, 'Rating must be 1 to 5')
  return { text, rating }
}

// GET /api/gems/:id/reviews - list reviews, newest first (public)
router.get('/:id/reviews', async (req, res, next) => {
  try {
    const gemRef = gems.doc(req.params.id)
    if (!(await gemRef.get()).exists) throw httpError(404, 'Gem not found')
    const snap = await gemRef.collection('reviews').orderBy('createdAt', 'desc').get()
    res.json(snap.docs.map(d => {
      const data = d.data()
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toMillis?.() ?? null,
        editedAt: data.editedAt?.toMillis?.() ?? null
      }
    }))
  } catch (err) {
    next(err)
  }
})

// POST /api/gems/:id/reviews - add your review (login required). Already have one? Use PUT to edit it.
router.post('/:id/reviews', requireAuth, async (req, res, next) => {
  try {
    const gemRef = gems.doc(req.params.id)
    if (!(await gemRef.get()).exists) throw httpError(404, 'Gem not found')

    const reviewRef = gemRef.collection('reviews').doc(req.uid)
    if ((await reviewRef.get()).exists) throw httpError(409, 'You already reviewed this gem. Edit your review instead.')

    const review = parseReview(req.body)
    const user = await adminAuth.getUser(req.uid)
    const authorName = (user.email || 'someone').split('@')[0]

    await reviewRef.set({ ...review, authorName, createdAt: FieldValue.serverTimestamp() })
    res.status(201).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// PUT /api/gems/:id/reviews - edit your own review (login required)
router.put('/:id/reviews', requireAuth, async (req, res, next) => {
  try {
    const reviewRef = gems.doc(req.params.id).collection('reviews').doc(req.uid)
    if (!(await reviewRef.get()).exists) throw httpError(404, "You haven't reviewed this gem yet")
    await reviewRef.update({ ...parseReview(req.body), editedAt: FieldValue.serverTimestamp() })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/gems/:id/reviews - delete your own review (login required)
router.delete('/:id/reviews', requireAuth, async (req, res, next) => {
  try {
    await gems.doc(req.params.id).collection('reviews').doc(req.uid).delete()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router