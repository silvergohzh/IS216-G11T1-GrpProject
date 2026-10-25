// Hawker sign-up (apply for a stall) and menu management. Owner: M6
//
// How a hawker joins:
//   1. They make an account and fill in their stall details (HawkerSignupView.vue).
//      That saves an APPLICATION: hawkerApplications/{uid} with status "pending".
//   2. An admin approves it (routes/admin.js). Only then is a real stall created in
//      places/{id}, and the account becomes a hawker for that stall.
//   3. The hawker manages their menu here: places/{id}.menu = [{ id, name, price, available }]
//      price is in CENTS. Menu changes show up straight away on the public stall page
//      and in pre-orders (routes/orders.js reads prices from this menu).
import { Router } from 'express'
import { randomUUID } from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../firebase.js'
import { requireAuth, requireRole, getRole } from '../middleware/auth.js'
import { readMenuPhoto } from '../services/menuScan.js'

const router = Router()
const applications = db.collection('hawkerApplications')
const DIETARY = ['halal', 'vegetarian', 'no-beef']
const SERVICE_MODES = ['dine-in', 'takeaway']

// Makes an error with an HTTP status code. The shared handler in index.js sends it to the browser.
function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

// Turn a price typed in dollars ("4.50") into cents (450), and check it is sensible
function toCents(dollars) {
  const cents = Math.round(Number(dollars) * 100)
  if (!(cents > 0 && cents <= 10000)) throw httpError(400, 'Price must be between $0.01 and $100')
  return cents
}

// Check a dish name
function cleanName(name) {
  const clean = String(name || '').trim()
  if (!clean) throw httpError(400, 'Dish name is required')
  if (clean.length > 60) throw httpError(400, 'Dish name is too long (60 letters max)')
  return clean
}

// Change a stall's menu safely (in a transaction, like updateOrder in orders.js).
// Also keeps priceMin and priceMax (in DOLLARS) up to date, because the
// voting shortlist uses them for the budget filter (services/shortlist.js).
async function updateMenu(placeId, change) {
  const ref = db.collection('places').doc(placeId)
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw httpError(404, 'Stall not found')

    const menu = snap.data().menu || []
    change(menu)

    const prices = menu.filter(d => d.available !== false).map(d => d.price)
    tx.update(ref, {
      menu: menu,
      priceMin: prices.length ? Math.min(...prices) / 100 : 0,
      priceMax: prices.length ? Math.max(...prices) / 100 : 0
    })
    return menu
  })
}

// ---------- 1. Applying to be a hawker ----------

// POST /api/hawkers/apply   body: { applicantName, stallName, cuisine, address, lat, lng, dietary, serviceModes }
router.post('/apply', requireAuth, async (req, res, next) => {
  try {
    const { role } = await getRole(req.uid)
    if (role === 'hawker') throw httpError(409, 'You already run a stall')

    const b = req.body
    const stallName = String(b.stallName || '').trim()
    const applicantName = String(b.applicantName || '').trim()
    const cuisine = String(b.cuisine || '').trim()
    const address = String(b.address || '').trim()
    const lat = Number(b.lat)
    const lng = Number(b.lng)
    if (!applicantName) throw httpError(400, 'Your name is required')
    if (!stallName) throw httpError(400, 'Stall name is required')
    if (!cuisine) throw httpError(400, 'Cuisine is required')
    if (!address) throw httpError(400, 'Address is required')
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || b.lat === null || b.lng === null) {
      throw httpError(400, 'Click the map to show where your stall is')
    }

    const serviceModes = Array.isArray(b.serviceModes) ? b.serviceModes.filter(m => SERVICE_MODES.includes(m)) : []
    await applications.doc(req.uid).set({
      uid: req.uid,
      applicantName: applicantName,
      stallName: stallName,
      cuisine: cuisine,
      address: address,
      lat: lat,
      lng: lng,
      dietary: Array.isArray(b.dietary) ? b.dietary.filter(d => DIETARY.includes(d)) : [],
      serviceModes: serviceModes.length ? serviceModes : SERVICE_MODES,
      status: 'pending',
      reason: '',
      createdAt: FieldValue.serverTimestamp()
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// GET /api/hawkers/application - my own application (or null)
router.get('/application', requireAuth, async (req, res, next) => {
  try {
    const snap = await applications.doc(req.uid).get()
    res.json(snap.exists ? snap.data() : null)
  } catch (err) {
    next(err)
  }
})

// ---------- 2. Menu management (hawkers only, for their own stall) ----------

// ADD a dish: POST /api/hawkers/menu   body: { name, price }   (price in dollars, e.g. "4.50")
router.post('/menu', requireAuth, requireRole('hawker'), async (req, res, next) => {
  try {
    const dish = { id: randomUUID(), name: cleanName(req.body.name), price: toCents(req.body.price), available: true }
    await updateMenu(req.placeId, menu => menu.push(dish))
    res.status(201).json(dish)
  } catch (err) {
    next(err)
  }
})

// ADD MANY dishes at once (the reviewed AI scan): POST /api/hawkers/menu/many   body: { items: [{ name, price }] }
router.post('/menu/many', requireAuth, requireRole('hawker'), async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : []
    if (items.length === 0) throw httpError(400, 'Choose at least one dish to add')
    if (items.length > 50) throw httpError(400, 'At most 50 dishes at a time')

    const dishes = items.map(item => ({
      id: randomUUID(),
      name: cleanName(item.name),
      price: toCents(item.price),
      available: true
    }))
    await updateMenu(req.placeId, menu => menu.push(...dishes))
    res.status(201).json({ added: dishes.length })
  } catch (err) {
    next(err)
  }
})

// EDIT a dish: PATCH /api/hawkers/menu/:dishId   body: any of { name, price, available }
router.patch('/menu/:dishId', requireAuth, requireRole('hawker'), async (req, res, next) => {
  try {
    await updateMenu(req.placeId, menu => {
      const dish = menu.find(d => d.id === req.params.dishId)
      if (!dish) throw httpError(404, 'Dish not found')
      if (req.body.name !== undefined) dish.name = cleanName(req.body.name)
      if (req.body.price !== undefined) dish.price = toCents(req.body.price)
      if (req.body.available !== undefined) dish.available = req.body.available === true
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// DELETE a dish: DELETE /api/hawkers/menu/:dishId
router.delete('/menu/:dishId', requireAuth, requireRole('hawker'), async (req, res, next) => {
  try {
    await updateMenu(req.placeId, menu => {
      const index = menu.findIndex(d => d.id === req.params.dishId)
      if (index === -1) throw httpError(404, 'Dish not found')
      menu.splice(index, 1)
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// AI SCAN: POST /api/hawkers/menu/scan   body: { photo }
// Reads a photo of the menu board and returns a DRAFT list. Nothing is saved yet:
// the hawker checks the draft first (AI can misread prices), then saves it with /menu/many.
router.post('/menu/scan', requireAuth, requireRole('hawker'), async (req, res, next) => {
  try {
    const photo = req.body.photo
    if (typeof photo !== 'string' || !photo.startsWith('data:image/')) throw httpError(400, 'Please choose a photo of your menu')
    const items = await readMenuPhoto(photo)
    res.json({ items: items })
  } catch (err) {
    next(err)
  }
})

export default router
