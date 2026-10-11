// Hidden Gems API  : M5
// Firestore: gems/{id} { name, mustTry, price, address, lat, lng, dietary, submittedBy, upvoters: [uid], createdAt }

import { Router } from 'express' 
import { FieldValue } from 'firebase-admin/firestore'
import { db, adminAuth } from '../firebase.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const gems = db.collection('gems')
const UPVOTES_NEEDED = 3
const DIETARY = ['halal', 'vegetarian']


// Makes an error with an HTTP status code. The shared handler in index.js sends it to the browser.
const httpError = (status, msg) => Object.assign(new Error(msg), { status })


// Check and clean the data the form sends. Used by both submit and edit.
function parseGem(body) {
  const { name, mustTry, price, address, lat, lng, dietary } = body

  if (!name?.trim()) throw httpError(400, 'Name is required')

  const priceNum = Number(price)
  if (!Number.isFinite(priceNum) || priceNum < 0) throw httpError(400, 'Price must be a number, 0 or more')

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
    price: priceNum,
    address: address?.trim() || '',
    lat: latNum,
    lng: lngNum,
    dietary: Array.isArray(dietary) ? dietary.filter(d => DIETARY.includes(d)) : []
  }
}

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
    await ref.update(parseGem(req.body))
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
      const upvoters = doc.data().upvoters || []
      if (upvoters.includes(req.uid)) throw httpError(409, 'You already upvoted this gem')
      t.update(ref, { upvoters: FieldValue.arrayUnion(req.uid) })
      return upvoters.length + 1
    })
    res.json({ ok: true, upvoteCount, inPool: upvoteCount >= UPVOTES_NEEDED })
  } catch (err) {
    next(err)
  }
})

// ---- Reviews: gems/{id}/reviews/{uid} { text, rating, authorName, createdAt } ----
// The review's ID is the author's uid, so each user has at most one review per gem.

// GET /api/gems/:id/reviews - list reviews, newest first (public)
router.get('/:id/reviews', async (req, res, next) => {
  try {
    const gemRef = gems.doc(req.params.id)
    if (!(await gemRef.get()).exists) throw httpError(404, 'Gem not found')
    const snap = await gemRef.collection('reviews').orderBy('createdAt', 'desc').get()
    res.json(snap.docs.map(d => {
      const data = d.data()
      return { id: d.id, ...data, createdAt: data.createdAt?.toMillis?.() ?? null }
    }))
  } catch (err) {
    next(err)
  }
})

// POST /api/gems/:id/reviews - add or replace your review (login required)
router.post('/:id/reviews', requireAuth, async (req, res, next) => {
  try {
    const gemRef = gems.doc(req.params.id)
    if (!(await gemRef.get()).exists) throw httpError(404, 'Gem not found')

    const text = String(req.body.text ?? '').trim()
    const rating = Number(req.body.rating)
    if (!text) throw httpError(400, 'Write a short review')
    if (text.length > 300) throw httpError(400, 'Review is too long (max 300 characters)')
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError(400, 'Rating must be 1 to 5')

    const user = await adminAuth.getUser(req.uid)
    const authorName = (user.email || 'someone').split('@')[0]

    await gemRef.collection('reviews').doc(req.uid).set({
      text, rating, authorName, createdAt: FieldValue.serverTimestamp()
    })
    res.status(201).json({ ok: true })
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

