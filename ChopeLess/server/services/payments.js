// Stripe payments (TEST MODE only, no real money). Owner: M6
//
// How paying works:
//   1. The diner presses "Pay". Our server asks Stripe for a checkout page (routes/orders.js).
//   2. The diner pays on Stripe's page with a test card: 4242 4242 4242 4242.
//   3. Stripe tells OUR SERVER the payment worked, by calling our "webhook" (routes/payments.js).
//   4. Only then do we mark the order as paid.
// We never trust the browser to say "I paid", because anyone could fake that.
import Stripe from 'stripe'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../firebase.js'

// The secret key lives in server/.env (STRIPE_SECRET_KEY=sk_test_...), never in the browser.
// Without a key the app still works in "demo mode": orders are marked paid straight away.
export const stripeEnabled = !!process.env.STRIPE_SECRET_KEY
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_not_set')

// Mark an order as paid. Called by the webhook (or straight away in demo mode).
export async function markOrderPaid(orderId) {
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) return

  // Only an order that is waiting for payment can become paid.
  // (If Stripe sends the same message twice, the second one does nothing.)
  const status = snap.data().status
  if (status !== 'cart' && status !== 'awaiting_payment') return

  await ref.update({ status: 'paid', paidAt: FieldValue.serverTimestamp() })
}
