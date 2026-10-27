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

// Mark an order as paid, and save a PAYMENT RECORD for it. Called by the webhook (or straight away in demo mode).
//   method:        'stripe' or 'demo'
//   paymentIntent: Stripe's id for the payment (we need it to refund later). Empty in demo mode.
//
// Firestore: payments/{orderId}   (one payment per order, so the id is the order's id)
//   { orderId, placeId, placeName, payerUid, payerName, memberUids, amount (cents),
//     method, paymentIntent, status ('paid' or 'refunded'), refundReason, paidAt, updatedAt }
export async function markOrderPaid(orderId, method = 'demo', paymentIntent = '') {
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) return

  // Only an order that is waiting for payment can become paid.
  // (If Stripe sends the same message twice, the second one does nothing.)
  const order = snap.data()
  if (order.status !== 'cart' && order.status !== 'awaiting_payment') return

  await ref.update({ status: 'paid', paidAt: FieldValue.serverTimestamp() })

  // CREATE the payment record. The person who started the order is the one who paid.
  const payer = order.members.find(m => m.uid === order.ownerUid)
  await db.collection('payments').doc(orderId).set({
    orderId: orderId,
    placeId: order.placeId,
    placeName: order.placeName,
    payerUid: order.ownerUid,
    payerName: payer ? payer.name : 'Guest',
    memberUids: order.memberUids,  // everyone in the group order can see the receipt
    amount: order.total,           // in cents
    method: method,
    paymentIntent: paymentIntent,
    status: 'paid',
    refundReason: '',
    paidAt: Date.now(),
    updatedAt: Date.now()
  })
}
