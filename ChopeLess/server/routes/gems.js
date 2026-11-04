// Hidden Gems API  : M5
// Firestore: gems/{id} { name, mustTry, cuisine, address, lat, lng, priceMin, priceMax, dietary, serviceModes,
//                        waitMins, imageUrl, submittedBy, upvoters: [uid], ratingSum, ratingCount, createdAt }
// The id is a readable slug of the name, e.g. "ba-buong-banh-mi".
// A gem with UPVOTES_NEEDED upvoters is copied into "places" with the SAME id, in the same shape as the seeded places.
// Its community menu (gems/{id}/menuItems) is mirrored into places/{id}.menu, which is where pre-orders read menus.

import { Router } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { db, adminAuth } from '../firebase.js'
import { requireAuth } from '../middleware/auth.js'
import { awardPoints, POINT_RULES } from '../services/points.js'   // Janani's Makan Points
import { httpError, slugify, parseGem, IMAGE_PREFIX, MAX_IMAGE_CHARS } from '../services/gemRules.js'

const router = Router()
const gems = db.collection('gems')
const places = db.collection('places')
const UPVOTES_NEEDED = 3
const MENU_POINTS = POINT_RULES.GEM_MENU_CONTRIBUTION


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

// Mirrors a gem's community dishes into its copy in "places" (places/{id}.menu), in the shape the
// pre-order pages already read (price in CENTS). Does nothing unless the gem is in the voting pool.
async function syncPlaceMenu(id) {
  // The copy is places/<id>, or places/gem-<id> for gems made before readable IDs
  let placeRef = null
  for (const pid of [id, `gem-${id}`]) {
    const snap = await places.doc(pid).get()
    if (snap.exists && snap.data().fromGem && snap.data().gemId === id) { placeRef = snap.ref; break }
  }
  if (!placeRef) return

  const items = await gems.doc(id).collection('menuItems').orderBy('createdAt').get()
  const menu = items.docs.map(d => {
    const x = d.data()
    return { id: d.id, name: x.name, price: Math.round(Number(x.price) * 100), addedByName: x.addedByName || '' }
  })
  await placeRef.update({ menu })
}

// A menu change must never make the request fail, so problems are only logged
const safeSync = async id => {
  try { await syncPlaceMenu(id) } catch (err) { console.error('[Hidden Gems] Could not copy the menu into places:', err.message) }
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
        await safeSync(ref.id)
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
    await db.recursiveDelete(ref)   // also deletes its reviews and menu

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
    // The gem just joined the voting pool, so its community menu comes along
    if (upvoteCount === UPVOTES_NEEDED) await safeSync(ref.id)
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
    const gemDoc = await gemRef.get()
    if (!gemDoc.exists) throw httpError(404, 'Gem not found')
    const snap = await gemRef.collection('reviews').orderBy('createdAt', 'desc').get()

    // Keep the gem's average in step with its reviews (fixes reviews made before ratings existed)
    const ratingSum = snap.docs.reduce((sum, d) => sum + (Number(d.data().rating) || 0), 0)
    const g = gemDoc.data()
    if (g.ratingSum !== ratingSum || g.ratingCount !== snap.size) {
      await gemRef.update({ ratingSum, ratingCount: snap.size })
    }

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

// ---- Community menu: gems/{id}/menuItems/{itemId} and gems/{id}/menuPhotos/{photoId} ----
// Added by users, not by the stall, so the app always shows a "subject to accuracy" disclaimer.
// Dishes are in DOLLARS here. They are copied into places/{id}.menu in CENTS once the gem is in the pool.
// There is no limit on how many dishes or photos a gem can have.

function parseMenuItem(body) {
  const name = String(body.name ?? '').trim()
  const price = Number(body.price)
  if (!name) throw httpError(400, 'Enter the dish name')
  if (name.length > 60) throw httpError(400, 'Dish name is too long (max 60 characters)')
  if (body.price === '' || body.price == null || !Number.isFinite(price) || price < 0 || price > 500) {
    throw httpError(400, 'Enter a valid price (0 to 500)')
  }
  return { name, price: Math.round(price * 100) / 100 }
}

function parseMenuPhoto(imageUrl) {
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith(IMAGE_PREFIX)) throw httpError(400, 'Add a photo of the menu')
  if (imageUrl.length > MAX_IMAGE_CHARS) throw httpError(400, 'That photo is too big. Pick a smaller one.')
  if (!/^[A-Za-z0-9+/=]+$/.test(imageUrl.slice(IMAGE_PREFIX.length))) throw httpError(400, 'That photo is not valid')
  return imageUrl
}

const nameOf = async uid => ((await adminAuth.getUser(uid)).email || 'someone').split('@')[0]
const toMs = ts => ts?.toMillis?.() ?? null

// Makan Points for adding to a gem's menu: once per person per gem, for whatever they add first (dish or photo).
// The ledger entry id is eventId + uid, so awardPoints ignores a second contribution to the same gem.
async function rewardMenuContribution(uid, gemId, gemName) {
  try {
    const result = await awardPoints({
      uid,
      eventId: `gemmenu_${gemId}`,
      points: MENU_POINTS,
      reason: `Added a menu to the Hidden Gem "${gemName}"`
    })
    return result.awarded ? MENU_POINTS : 0
  } catch (err) {
    console.error('[Makan Points] Could not award menu points:', err.message)
    return 0
  }
}

// GET /api/gems/:id/menu - dishes and menu photos (public)
router.get('/:id/menu', async (req, res, next) => {
  try {
    const gemRef = gems.doc(req.params.id)
    if (!(await gemRef.get()).exists) throw httpError(404, 'Gem not found')
    const [itemSnap, photoSnap] = await Promise.all([
      gemRef.collection('menuItems').orderBy('createdAt').get(),
      gemRef.collection('menuPhotos').orderBy('createdAt').get()
    ])
    res.json({
      items: itemSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: toMs(d.data().createdAt) })),
      photos: photoSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: toMs(d.data().createdAt) }))
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/gems/:id/menu/items - add a dish (login required)
router.post('/:id/menu/items', requireAuth, async (req, res, next) => {
  try {
    const gemRef = gems.doc(req.params.id)
    const gemDoc = await gemRef.get()
    if (!gemDoc.exists) throw httpError(404, 'Gem not found')

    const ref = await gemRef.collection('menuItems').add({
      ...parseMenuItem(req.body),
      addedBy: req.uid,
      addedByName: await nameOf(req.uid),
      createdAt: FieldValue.serverTimestamp()
    })
    await safeSync(gemRef.id)
    const pointsAwarded = await rewardMenuContribution(req.uid, gemRef.id, gemDoc.data().name)
    res.status(201).json({ id: ref.id, pointsAwarded })
  } catch (err) {
    next(err)
  }
})

// PUT /api/gems/:id/menu/items/:itemId - edit a dish you added (login required)
router.put('/:id/menu/items/:itemId', requireAuth, async (req, res, next) => {
  try {
    const ref = gems.doc(req.params.id).collection('menuItems').doc(req.params.itemId)
    const doc = await ref.get()
    if (!doc.exists) throw httpError(404, 'Dish not found')
    if (doc.data().addedBy !== req.uid) throw httpError(403, 'You can only edit dishes you added')
    await ref.update(parseMenuItem(req.body))
    await safeSync(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/gems/:id/menu/items/:itemId - delete a dish (the person who added it, or the gem's owner)
router.delete('/:id/menu/items/:itemId', requireAuth, async (req, res, next) => {
  try {
    const gemRef = gems.doc(req.params.id)
    const gemDoc = await gemRef.get()
    if (!gemDoc.exists) throw httpError(404, 'Gem not found')
    const ref = gemRef.collection('menuItems').doc(req.params.itemId)
    const doc = await ref.get()
    if (!doc.exists) throw httpError(404, 'Dish not found')
    if (doc.data().addedBy !== req.uid && gemDoc.data().submittedBy !== req.uid) {
      throw httpError(403, 'You can only delete dishes you added')
    }
    await ref.delete()
    await safeSync(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/gems/:id/menu/photos - add a photo of the menu (login required)
router.post('/:id/menu/photos', requireAuth, async (req, res, next) => {
  try {
    const gemRef = gems.doc(req.params.id)
    const gemDoc = await gemRef.get()
    if (!gemDoc.exists) throw httpError(404, 'Gem not found')

    const ref = await gemRef.collection('menuPhotos').add({
      imageUrl: parseMenuPhoto(req.body.imageUrl),
      addedBy: req.uid,
      addedByName: await nameOf(req.uid),
      createdAt: FieldValue.serverTimestamp()
    })
    const pointsAwarded = await rewardMenuContribution(req.uid, gemRef.id, gemDoc.data().name)
    res.status(201).json({ id: ref.id, pointsAwarded })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/gems/:id/menu/photos/:photoId - delete a menu photo (the uploader, or the gem's owner)
router.delete('/:id/menu/photos/:photoId', requireAuth, async (req, res, next) => {
  try {
    const gemRef = gems.doc(req.params.id)
    const gemDoc = await gemRef.get()
    if (!gemDoc.exists) throw httpError(404, 'Gem not found')
    const ref = gemRef.collection('menuPhotos').doc(req.params.photoId)
    const doc = await ref.get()
    if (!doc.exists) throw httpError(404, 'Photo not found')
    if (doc.data().addedBy !== req.uid && gemDoc.data().submittedBy !== req.uid) {
      throw httpError(403, 'You can only delete photos you added')
    }
    await ref.delete()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router