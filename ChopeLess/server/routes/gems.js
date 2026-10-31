// Hidden Gems API  : M5
// Firestore: gems/{id} { name, mustTry, cuisine, address, lat, lng, priceMin, priceMax, dietary, serviceModes,
//                        waitMins, imageUrl, submittedBy, upvoters: [uid], ratingSum, ratingCount, createdAt }
// The id is a readable slug of the name, e.g. "ba-buong-banh-mi".
// A gem with UPVOTES_NEEDED upvoters is copied into "places" with the SAME id, in the same shape as the
// seeded places (photo included, so it looks the same on the swipe cards).

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
const IMAGE_PREFIX = 'data:image/jpeg;base64,'
const MAX_IMAGE_CHARS = 400000   // keeps the gem document well under Firestore's 1 MB limit


// Makes an error with an HTTP status code. The shared handler in index.js sends it to the browser.
const httpError = (status, msg) => Object.assign(new Error(msg), { status })

// Turns a name into a readable document ID: "Ba Buông Bánh Mì" -> "ba-buong-banh-mi"
const slugify = s => String(s)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip accents
  .replace(/đ/gi, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40)

// Finds an unused ID for a new gem. It must be free in BOTH "gems" and "places",
// because the gem's copy in "places" uses the same ID. Adds -2, -3 ... if the name is taken.
async function freeGemId(name) {
  const base = slugify(name) || 'gem'
  let id = base
  for (let i = 2; ; i++) {
    const [inGems, inPlaces] = await Promise.all([gems.doc(id).get(), places.doc(id).get()])
    if (!inGems.exists && !inPlaces.exists) return id
    id = `${base}-${i}`
  }
}

// The photo arrives as a small JPEG data URL made by the browser
function parseImage(imageUrl) {
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith(IMAGE_PREFIX)) {
    throw httpError(400, 'Add a photo of the place')
  }
  if (imageUrl.length > MAX_IMAGE_CHARS) throw httpError(400, 'That photo is too big. Pick a smaller one.')
  if (!/^[A-Za-z0-9+/=]+$/.test(imageUrl.slice(IMAGE_PREFIX.length))) throw httpError(400, 'That photo is not valid')
  return imageUrl
}

// Check and clean the data the form sends. Used by both submit and edit.
// A gem must have everything a place needs, so it can join the voting pool.
function parseGem(body) {
  const { name, mustTry, cuisine, address, lat, lng, priceMin, priceMax, dietary, serviceModes, waitMins, imageUrl } = body

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
    waitMins: wait,
    imageUrl: parseImage(imageUrl)
  }
}

// ---- Joining the voting pool = a copy of the gem in "places" (same fields as places.json) ----

// Old test gems may be missing the newer fields. Only complete gems (photo included) can become places.
const isComplete = g =>
  g.lat != null && g.lng != null && !!g.address && !!g.cuisine &&
  g.priceMin != null && g.priceMax != null && g.waitMins != null && !!g.serviceModes?.length &&
  !!g.imageUrl

// The copy has the same ID as the gem
const placeRefOf = id => places.doc(id)

// Safety: only write to or delete a "places" document if it is free or is itself a gem copy.
// A seeded place with the same ID is never touched.
const isGemCopyOrFree = snap => !snap.exists || !!snap.data().fromGem

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
  imageUrl: g.imageUrl,
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
      ratingSum: 0,
      ratingCount: 0,
      createdAt: FieldValue.serverTimestamp()
    }
    const id = await freeGemId(gem.name)
    await gems.doc(id).set(gem)
    res.status(201).json({ id })
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

    // If the gem is in the voting pool (or now qualifies), keep its place in sync
    const merged = { ...doc.data(), ...data }
    if ((merged.upvoters || []).length >= UPVOTES_NEEDED && isComplete(merged)) {
      const placeRef = placeRefOf(ref.id)
      const placeSnap = await placeRef.get()
      if (isGemCopyOrFree(placeSnap)) {
        const fields = placeSnap.exists
          ? placeBase(ref.id, merged)
          : { ...placeBase(ref.id, merged), ...placeLatest(merged) }
        await placeRef.set(fields, { merge: true })
      }
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
    await db.recursiveDelete(ref)   // also deletes its reviews

    // Remove this gem's copy from "places" (also the older gem-<id> naming)
    for (const pid of [ref.id, `gem-${ref.id}`]) {
      const placeRef = places.doc(pid)
      const snap = await placeRef.get()
      if (snap.exists && snap.data().fromGem && snap.data().gemId === ref.id) await placeRef.delete()
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/gems/:id/upvote - one vote per user (login required)
router.post('/:id/upvote', requireAuth, async (req, res, next) => {
  try {
    const ref = gems.doc(req.params.id)
    const placeRef = placeRefOf(ref.id)
    const upvoteCount = await db.runTransaction(async (t) => {
      // All reads come first, then the writes
      const doc = await t.get(ref)
      const placeSnap = await t.get(placeRef)
      if (!doc.exists) throw httpError(404, 'Gem not found')
      const g = doc.data()
      const upvoters = g.upvoters || []
      if (upvoters.includes(req.uid)) throw httpError(409, 'You already upvoted this gem')

      const newCount = upvoters.length + 1
      t.update(ref, { upvoters: FieldValue.arrayUnion(req.uid) })
      // The vote that reaches the threshold copies the gem into "places"
      if (newCount === UPVOTES_NEEDED && isComplete(g) && isGemCopyOrFree(placeSnap)) {
        t.set(placeRef, { ...placeBase(ref.id, g), ...placeLatest(g) })
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
    const placeRef = placeRefOf(ref.id)
    const upvoteCount = await db.runTransaction(async (t) => {
      const doc = await t.get(ref)
      const placeSnap = await t.get(placeRef)
      if (!doc.exists) throw httpError(404, 'Gem not found')
      const upvoters = doc.data().upvoters || []
      if (!upvoters.includes(req.uid)) throw httpError(409, "You haven't upvoted this gem")

      const newCount = upvoters.length - 1
      t.update(ref, { upvoters: FieldValue.arrayRemove(req.uid) })
      // Dropping below the threshold takes it out of the voting pool (only if it is this gem's copy)
      if (newCount < UPVOTES_NEEDED && placeSnap.exists && placeSnap.data().fromGem) t.delete(placeRef)
      return newCount
    })
    res.json({ ok: true, upvoteCount, inPool: upvoteCount >= UPVOTES_NEEDED })
  } catch (err) {
    next(err)
  }
})

// ---- Reviews: gems/{id}/reviews/{reviewId} { text, rating, authorUid, authorName, createdAt, editedAt } ----
// Users can post as many reviews as they like. The gem keeps ratingSum and ratingCount,
// so the board can show the average (ratingSum / ratingCount) out of 5 stars.

// Check and clean a review. Used by post and edit.
function parseReview(body) {
  const text = String(body.text ?? '').trim()
  const rating = Number(body.rating)
  if (!text) throw httpError(400, 'Write a short review')
  if (text.length > 300) throw httpError(400, 'Review is too long (max 300 characters)')
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError(400, 'Rating must be 1 to 5')
  return { text, rating }
}

// Recount a gem's ratings from its reviews. Runs after every review is added, edited or deleted.
async function refreshRating(gemRef) {
  const snap = await gemRef.collection('reviews').get()
  const ratingSum = snap.docs.reduce((sum, d) => sum + (Number(d.data().rating) || 0), 0)
  await gemRef.update({ ratingSum, ratingCount: snap.size })
}

// Reviews made before this change used the author's uid as their ID and had no authorUid
const reviewOwner = doc => doc.data().authorUid ?? doc.id

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
        authorUid: reviewOwner(d),
        createdAt: data.createdAt?.toMillis?.() ?? null,
        editedAt: data.editedAt?.toMillis?.() ?? null
      }
    }))
  } catch (err) {
    next(err)
  }
})

// POST /api/gems/:id/reviews - add a review (login required). You can add as many as you like.
router.post('/:id/reviews', requireAuth, async (req, res, next) => {
  try {
    const gemRef = gems.doc(req.params.id)
    if (!(await gemRef.get()).exists) throw httpError(404, 'Gem not found')

    const review = parseReview(req.body)
    const user = await adminAuth.getUser(req.uid)
    const authorName = (user.email || 'someone').split('@')[0]

    await gemRef.collection('reviews').add({
      ...review, authorUid: req.uid, authorName, createdAt: FieldValue.serverTimestamp()
    })
    await refreshRating(gemRef)
    res.status(201).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// PUT /api/gems/:id/reviews/:reviewId - edit one of your own reviews (login required)
router.put('/:id/reviews/:reviewId', requireAuth, async (req, res, next) => {
  try {
    const gemRef = gems.doc(req.params.id)
    const reviewRef = gemRef.collection('reviews').doc(req.params.reviewId)
    const doc = await reviewRef.get()
    if (!doc.exists) throw httpError(404, 'Review not found')
    if (reviewOwner(doc) !== req.uid) throw httpError(403, 'You can only edit your own reviews')

    await reviewRef.update({ ...parseReview(req.body), editedAt: FieldValue.serverTimestamp() })
    await refreshRating(gemRef)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/gems/:id/reviews/:reviewId - delete one of your own reviews (login required)
router.delete('/:id/reviews/:reviewId', requireAuth, async (req, res, next) => {
  try {
    const gemRef = gems.doc(req.params.id)
    const reviewRef = gemRef.collection('reviews').doc(req.params.reviewId)
    const doc = await reviewRef.get()
    if (!doc.exists) throw httpError(404, 'Review not found')
    if (reviewOwner(doc) !== req.uid) throw httpError(403, 'You can only delete your own reviews')

    await reviewRef.delete()
    await refreshRating(gemRef)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router