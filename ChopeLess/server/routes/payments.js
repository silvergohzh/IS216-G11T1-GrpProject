// Payments: the Stripe webhook, and managing payment records (delete). Owner: M6
//
// The payment records live in Firestore: payments/{orderId}  (see services/payments.js)
//   CREATE: only the server, when Stripe (or demo mode) says an order is paid
//   READ:   straight from Firestore in the browser (firestore.rules decides who sees what)
//   DELETE: remove a record   (admins only, e.g. to clean up test payments)
// Nobody can write payment records from the browser, so nobody can fake a payment.
import { Router } from 'express'
import { db } from '../firebase.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { stripe, markOrderPaid } from '../services/payments.js'

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
