// Stripe webhook: Stripe calls this when a payment succeeds. Owner: M6
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
// so index.js registers it BEFORE express.json().
import { Router } from 'express'
import { stripe, markOrderPaid } from '../services/payments.js'

const router = Router()

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
    const orderId = event.data.object.metadata.orderId
    await markOrderPaid(orderId)
  }

  // Tell Stripe we got the message, otherwise it keeps retrying
  res.json({ received: true })
})

export default router
