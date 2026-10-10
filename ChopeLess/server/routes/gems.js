// Hidden Gems API  : M5

import { Router } from 'express' 
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../firebase.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const gems = db.collection('gems')

// Validation Error 
const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 })


// GET - list of hidden gems, most upvoted first
router.get('/', async (req, res, next) => {
  try {
    const snap = await gems.orderBy('upvoteCount', 'desc').get()
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  } catch (err) {
    next(err)
  }
})

// POST - submit a new hidden gem (login required)
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, description, cuisine, address, lat, lng,
            priceMin, priceMax, dietary, serviceModes } = req.body

    if (!name?.trim() || !description?.trim() || !cuisine?.trim()) {
      throw badRequest('Name, description and cuisine are required')
    }

    const min = Number(priceMin)
    const max = Number(priceMax)
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
      throw badRequest('Enter a valid price range (min is 0 or more, max is not below min)')
    }

    const latNum = Number(lat)
    const lngNum = Number(lng)
    if (lat == null || lat === '' || lng == null || lng === '' ||
        !Number.isFinite(latNum) || !Number.isFinite(lngNum) ||
        Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) {
      throw badRequest('Pick the location on the map (valid latitude and longitude required)')
    }

    const gem = {
      name: name.trim(),
      description: description.trim(),
      cuisine: cuisine.trim(),
      address: address?.trim() || '',
      lat: latNum,
      lng: lngNum,
      priceMin: min,
      priceMax: max,
      dietary: Array.isArray(dietary) ? dietary : [],
      serviceModes: Array.isArray(serviceModes) && serviceModes.length
        ? serviceModes
        : ['dine-in', 'takeaway'],
      upvoteCount: 0,
      upvotedBy: [],
      submittedBy: req.uid,
      createdAt: FieldValue.serverTimestamp(),
    }

    const ref = await gems.add(gem)
    res.status(201).json({ id: ref.id })
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
      if (!doc.exists) throw Object.assign(new Error('Gem not found'), { status: 404 })
      const data = doc.data()
      if ((data.upvotedBy || []).includes(req.uid)) {
        throw Object.assign(new Error('You already upvoted this gem'), { status: 409 })
      }
      t.update(ref, {
        upvoteCount: FieldValue.increment(1),
        upvotedBy: FieldValue.arrayUnion(req.uid),
      })
      return (data.upvoteCount || 0) + 1
    })
    res.json({ ok: true, upvoteCount })
  } catch (err) {
    next(err)
  }
})


export default router


