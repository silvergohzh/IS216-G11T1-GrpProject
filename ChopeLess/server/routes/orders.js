// Pre-orders for pickup, group carts, checkout, and pickup with photo proof. Owner: M6
//
// Firestore: orders/{orderId}
//   {
//     placeId, placeName,           which stall the order is for
//     ownerUid,                      the person who started the order (they pay)
//     joinCode,                      6 letters friends type in to join the group cart
//     members:    [{ uid, name }],   everyone in the group cart
//     memberUids: [uid],             the same people as a plain list (the security rules need this)
//     items: [{ lineId, itemId, name, price, qty, addedBy, addedByName }],   price is in CENTS
//     total,                         in cents, worked out by the server
//     status,                        see the steps below
//     readyAt, pickupBy,             when it was ready, and the pickup deadline (milliseconds)
//     collectedAt, collectedByName,  who picked it up, and when
//     createdAt, paidAt
//   }
// Photo proof: orders/{orderId}/proofs/ready      (the hawker's photo when the food is ready)
//              orders/{orderId}/proofs/collected  (the diner's photo when they pick it up)
//
// The browser READS orders straight from Firestore (live updates).
// Every CHANGE goes through this file, so the server can check the rules and work out prices.
// That way nobody can change a price or mark their own order as paid.
import { Router } from 'express'
import { randomUUID } from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../firebase.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { stripe, stripeEnabled, markOrderPaid } from '../services/payments.js'

const router = Router()
const orders = db.collection('orders')

// An order moves through these steps, in this order:
//   cart -> awaiting_payment -> paid -> preparing -> ready -> collected
//   - the hawker moves it to "preparing", then to "ready" (with a photo)
//   - the DINER moves it to "collected" (with a photo) when they pick it up
// It can be cancelled while it is still a cart or waiting for payment.

// After the food is ready, the diner has this many minutes to collect it
const PICKUP_MINUTES = 15

// Letters for join codes. No I or O, so they can't be mixed up with 1 and 0.
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

// Makes an error with an HTTP status code. The shared handler in index.js sends it to the browser.
function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

// The name to show for a user: their profile name, or "Guest" if they have none
async function getName(uid) {
  const snap = await db.collection('users').doc(uid).get()
  if (snap.exists && snap.data().name) return snap.data().name
  return 'Guest'
}

// Add up the cart: price x quantity for every item (all in cents)
function cartTotal(items) {
  let total = 0
  for (const item of items) {
    total = total + item.price * item.qty
  }
  return total
}

// Make a random 6-letter code, e.g. "KQWTRM", that no other open cart is using
async function makeJoinCode() {
  while (true) {
    let code = ''
    for (let i = 0; i < 6; i++) {
      code = code + CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]
    }
    const taken = await orders.where('joinCode', '==', code).where('status', '==', 'cart').limit(1).get()
    if (taken.empty) return code
  }
}

// Check a proof photo sent by the browser.
// The browser shrinks it first, so it is a small JPEG written as text ("data:image/jpeg;base64,...").
function checkPhoto(photo) {
  if (typeof photo !== 'string' || !photo.startsWith('data:image/')) {
    throw httpError(400, 'Please add a photo as proof')
  }
  if (photo.length > 900000) { // Firestore documents can hold about 1 MB
    throw httpError(400, 'That photo is too big. Please try another one.')
  }
}

// Save a proof photo next to the order: orders/{orderId}/proofs/{kind}
async function saveProof(orderId, kind, photo, uid) {
  await orders.doc(orderId).collection('proofs').doc(kind).set({
    photo: photo,
    byUid: uid,
    byName: await getName(uid),
    at: Date.now()
  })
}

// Change an order safely.
// It runs inside a transaction: if two people change the same cart at the same moment,
// Firestore runs one change after the other, so nobody's change gets lost.
// "change" is a function that receives the order and edits it.
async function updateOrder(orderId, change) {
  const ref = orders.doc(orderId)
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw httpError(404, 'Order not found')

    const order = snap.data()
    await change(order)

    order.total = cartTotal(order.items)
    tx.set(ref, order)
    return order
  })
}

// Every route below needs a logged-in user
router.use(requireAuth)

// CREATE: POST /api/orders   body: { placeId }
// Starts a new, empty cart for one stall. You are the owner and the first member.
// If you already have an open cart at this stall, you get that one back instead of a second cart.
router.post('/', async (req, res, next) => {
  try {
    const place = await db.collection('places').doc(req.body.placeId || 'none').get()
    if (!place.exists) throw httpError(400, 'Choose a stall to order from')

    const open = await orders
      .where('ownerUid', '==', req.uid)
      .where('placeId', '==', place.id)
      .where('status', '==', 'cart')
      .limit(1)
      .get()
    if (!open.empty) return res.json({ id: open.docs[0].id })

    const name = await getName(req.uid)
    const order = {
      placeId: place.id,
      placeName: place.data().name,
      ownerUid: req.uid,
      joinCode: await makeJoinCode(),
      members: [{ uid: req.uid, name: name }],
      memberUids: [req.uid],
      items: [],
      total: 0,
      status: 'cart',
      createdAt: FieldValue.serverTimestamp()
    }
    const ref = await orders.add(order)
    res.status(201).json({ id: ref.id })
  } catch (err) {
    next(err)
  }
})

// JOIN: POST /api/orders/join   body: { code }
// A friend types the 6-letter code (or opens the shared link) to join the group cart.
router.post('/join', async (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase()
    const found = await orders.where('joinCode', '==', code).where('status', '==', 'cart').limit(1).get()
    if (found.empty) throw httpError(404, 'No open group order has that code')

    const orderId = found.docs[0].id
    const name = await getName(req.uid)
    await updateOrder(orderId, order => {
      if (order.memberUids.includes(req.uid)) return // already in the group
      order.members.push({ uid: req.uid, name: name })
      order.memberUids.push(req.uid)
    })
    res.json({ id: orderId })
  } catch (err) {
    next(err)
  }
})

// CREATE (cart item): POST /api/orders/:id/items   body: { itemId, qty }
// The price comes from the stall's menu on the server, never from the browser.
router.post('/:id/items', async (req, res, next) => {
  try {
    const qty = Number(req.body.qty) || 1
    if (qty < 1 || qty > 20) throw httpError(400, 'Quantity must be between 1 and 20')

    const name = await getName(req.uid)
    await updateOrder(req.params.id, async order => {
      if (!order.memberUids.includes(req.uid)) throw httpError(403, 'Join this order first')
      if (order.status !== 'cart') throw httpError(409, 'This order can no longer be changed')

      // Look up the dish on the stall's menu to get its real price
      const place = await db.collection('places').doc(order.placeId).get()
      const menu = place.data().menu || []
      const dish = menu.find(d => d.id === req.body.itemId)
      if (!dish) throw httpError(400, 'That dish is not on the menu')

      order.items.push({
        lineId: randomUUID(), // a unique id for this line, so it can be changed or removed later
        itemId: dish.id,
        name: dish.name,
        price: dish.price,
        qty: qty,
        addedBy: req.uid,
        addedByName: name
      })
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// UPDATE (cart item): PATCH /api/orders/:id/items/:lineId   body: { qty }
// You can only change the quantity of something YOU added (the owner can change anything).
router.patch('/:id/items/:lineId', async (req, res, next) => {
  try {
    const qty = Number(req.body.qty)
    if (!(qty >= 1 && qty <= 20)) throw httpError(400, 'Quantity must be between 1 and 20')

    await updateOrder(req.params.id, order => {
      if (order.status !== 'cart') throw httpError(409, 'This order can no longer be changed')
      const item = order.items.find(i => i.lineId === req.params.lineId)
      if (!item) throw httpError(404, 'Item not found')
      if (item.addedBy !== req.uid && order.ownerUid !== req.uid) throw httpError(403, 'You can only change your own items')

      item.qty = qty
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// DELETE (cart item): DELETE /api/orders/:id/items/:lineId
router.delete('/:id/items/:lineId', async (req, res, next) => {
  try {
    await updateOrder(req.params.id, order => {
      if (order.status !== 'cart') throw httpError(409, 'This order can no longer be changed')
      const item = order.items.find(i => i.lineId === req.params.lineId)
      if (!item) throw httpError(404, 'Item not found')
      if (item.addedBy !== req.uid && order.ownerUid !== req.uid) throw httpError(403, 'You can only remove your own items')

      order.items = order.items.filter(i => i.lineId !== req.params.lineId)
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// CANCEL: POST /api/orders/:id/cancel
// Only the owner, and only before paying. We keep the order (status "cancelled") instead of deleting it.
router.post('/:id/cancel', async (req, res, next) => {
  try {
    await updateOrder(req.params.id, order => {
      if (order.ownerUid !== req.uid) throw httpError(403, 'Only the person who started the order can cancel it')
      if (order.status !== 'cart' && order.status !== 'awaiting_payment') {
        throw httpError(409, 'Paid orders cannot be cancelled')
      }
      order.status = 'cancelled'
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// CHECKOUT: POST /api/orders/:id/checkout
// The owner pays for the whole group. Returns a Stripe page for the browser to open.
router.post('/:id/checkout', async (req, res, next) => {
  try {
    const order = await updateOrder(req.params.id, o => {
      if (o.ownerUid !== req.uid) throw httpError(403, 'Only the person who started the order can pay')
      if (o.status !== 'cart' && o.status !== 'awaiting_payment') throw httpError(409, 'This order has already been paid')
      if (o.items.length === 0) throw httpError(400, 'Your cart is empty')
      o.status = 'awaiting_payment'
    })

    // Demo mode: no Stripe key in server/.env, so pretend the payment worked
    if (!stripeEnabled) {
      await markOrderPaid(req.params.id)
      return res.json({ url: null, demo: true })
    }

    // Ask Stripe for a checkout page. Each cart line becomes one line on Stripe's page.
    const lineItems = order.items.map(item => ({
      quantity: item.qty,
      price_data: {
        currency: 'sgd',
        unit_amount: item.price, // Stripe also uses cents
        product_data: { name: item.name }
      }
    }))
    const website = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0]
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${website}/orders/${req.params.id}?paid=1`,
      cancel_url: `${website}/orders/${req.params.id}`,
      metadata: { orderId: req.params.id } // the webhook uses this to know which order was paid
    })

    res.json({ url: session.url })
  } catch (err) {
    next(err)
  }
})

// HAWKER, step 1: POST /api/orders/:id/preparing
// The hawker starts cooking a paid order. Only the hawker who runs this stall (or an admin).
router.post('/:id/preparing', requireRole('hawker', 'admin'), async (req, res, next) => {
  try {
    await updateOrder(req.params.id, order => {
      if (req.role === 'hawker' && order.placeId !== req.placeId) throw httpError(403, 'This order is for a different stall')
      if (order.status !== 'paid') throw httpError(409, 'Only paid orders can be prepared')
      order.status = 'preparing'
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// HAWKER, step 2: POST /api/orders/:id/ready   body: { photo }
// The hawker uploads a photo of the packed food. This starts the 15-minute pickup timer.
router.post('/:id/ready', requireRole('hawker', 'admin'), async (req, res, next) => {
  try {
    checkPhoto(req.body.photo)
    await updateOrder(req.params.id, order => {
      if (req.role === 'hawker' && order.placeId !== req.placeId) throw httpError(403, 'This order is for a different stall')
      if (order.status !== 'preparing') throw httpError(409, 'Start preparing the order first')
      order.status = 'ready'
      order.readyAt = Date.now()
      order.pickupBy = Date.now() + PICKUP_MINUTES * 60 * 1000 // 15 minutes from now
    })
    await saveProof(req.params.id, 'ready', req.body.photo, req.uid)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// DINER: POST /api/orders/:id/collect   body: { photo }
// Anyone in the group marks the order as collected, with a photo of the food they picked up.
router.post('/:id/collect', async (req, res, next) => {
  try {
    checkPhoto(req.body.photo)
    const name = await getName(req.uid)
    await updateOrder(req.params.id, order => {
      if (!order.memberUids.includes(req.uid)) throw httpError(403, 'Only people in this order can collect it')
      if (order.status !== 'ready') throw httpError(409, 'This order is not ready yet')
      order.status = 'collected'
      order.collectedAt = Date.now()
      order.collectedByName = name
    })
    await saveProof(req.params.id, 'collected', req.body.photo, req.uid)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
