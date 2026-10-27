// Payments: the Stripe webhook, and managing payment records (refund, delete). Owner: M6
//
// The payment records live in Firestore: payments/{orderId}  (see services/payments.js)
//   CREATE: only the server, when Stripe (or demo mode) says an order is paid
//   READ:   straight from Firestore in the browser (firestore.rules decides who sees what)
//   UPDATE: refund a payment  (the stall's hawker, or an admin)
//   DELETE: remove a record   (admins only, e.g. to clean up test payments)
// Nobody can write payment records from the browser, so nobody can fake a payment or a refund.
import { Router } from 'express'
import { db } from '../firebase.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { stripe, stripeEnabled, markOrderPaid } from '../services/payments.js'

const router = Router()
const payments = db.collection('payments')

// ---------- Stripe webhook: Stripe calls this when a payment succeeds ----------
// URL: POST /api/payments/webhook
//
// Why a webhook? After paying, the diner's browser goes back to our site, but the browser
// could be faked or closed. Stripe calling OUR SERVER directly is the only proof we trust.
//
// How do we know it really is Stripe calling? Every message comes with a "stripe-signature"
// header, made with a secret only Stripe and our server know (STRIPE_WEBHOOK_SECRET).
// stripe.webhooks.constructEvent checks that signature. A fake message fails the check.
//
// Note: this route needs the RAW request body to check the signature,
// so index.js gives it express.raw() BEFORE express.json().
router.post('/webhook', async (req, res) => {
  let event
  try {
    event = stripe.webhooks.constructEvent(
      req.body,                              // the raw body, exactly as Stripe sent it
      req.header('stripe-signature'),        // Stripe's signature
      process.env.STRIPE_WEBHOOK_SECRET      // our shared secret
    )
  } catch (err) {
    // Wrong or missing signature: not really from Stripe, so ignore it
    return res.status(400).json({ error: 'Invalid signature' })
  }

  // "checkout.session.completed" = the diner finished paying on Stripe's page
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    await markOrderPaid(session.metadata.orderId, 'stripe', session.payment_intent || '')
  }

  // Tell Stripe we got the message, otherwise it keeps retrying
  res.json({ received: true })
})

// ---------- UPDATE: refund a payment ----------
// POST /api/payments/:id/refund   body: { reason }
// Allowed: the hawker of that stall, or an admin.
router.post('/:id/refund', requireAuth, requireRole('hawker', 'admin'), async (req, res, next) => {
  try {
    const ref = payments.doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ error: 'Payment not found' })

    const payment = snap.data()
    if (req.role === 'hawker' && payment.placeId !== req.placeId) {
      return res.status(403).json({ error: 'This payment is for a different stall' })
    }
    if (payment.status === 'refunded') {
      return res.status(409).json({ error: 'This payment was already refunded' })
    }
    const reason = String(req.body.reason || '').trim()
    if (!reason) return res.status(400).json({ error: 'Please give a reason for the refund' })

    // Paid with Stripe (test mode)? Ask Stripe to give the money back too.
    if (payment.method === 'stripe' && payment.paymentIntent && stripeEnabled) {
      await stripe.refunds.create({ payment_intent: payment.paymentIntent })
    }

    await ref.update({ status: 'refunded', refundReason: reason, updatedAt: Date.now() })

    // The order is refunded too. If it hasn't been collected yet, it is cancelled.
    const orderRef = db.collection('orders').doc(req.params.id)
    const order = await orderRef.get()
    if (order.exists) {
      const changes = { refunded: true }
      if (order.data().status !== 'collected') changes.status = 'cancelled'
      await orderRef.update(changes)
    }

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// ---------- DELETE: remove a payment record ----------
// DELETE /api/payments/:id   (admins only)
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const ref = payments.doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ error: 'Payment not found' })
    await ref.delete()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
