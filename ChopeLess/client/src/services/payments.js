// Payment records for the browser. Owner: M6
// Firestore: payments/{orderId}  (one record per paid order, created by the server)
// READ: live from Firestore. firestore.rules only lets you see the payments you are allowed to.
// CHANGES (refund, delete): through our server, which checks your role.
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { api } from '../lib/api'

// Newest first
function newestFirst(list) {
  return list.sort((a, b) => b.paidAt - a.paidAt)
}

// Turn a Firestore snapshot into a plain list
function toList(snap) {
  return newestFirst(snap.docs.map(d => ({ id: d.id, ...d.data() })))
}

// ---------- READ (live) ----------

// Diner: payments for group orders I was part of (my receipts)
export function watchMyPayments(uid, onChange, onError) {
  const q = query(collection(db, 'payments'), where('memberUids', 'array-contains', uid))
  return onSnapshot(q, snap => onChange(toList(snap)), onError)
}

// Hawker: payments made to my stall (my earnings)
export function watchStallPayments(placeId, onChange, onError) {
  const q = query(collection(db, 'payments'), where('placeId', '==', placeId))
  return onSnapshot(q, snap => onChange(toList(snap)), onError)
}

// Admin: every payment
export function watchAllPayments(onChange, onError) {
  return onSnapshot(collection(db, 'payments'), snap => onChange(toList(snap)), onError)
}

// ---------- UPDATE and DELETE (through the server) ----------

// Hawker (own stall) or admin: give the money back, with a reason
export const refundPayment = (id, reason) => api(`/payments/${id}/refund`, { method: 'POST', body: { reason } })

// Admin only: remove a payment record
export const deletePayment = id => api(`/payments/${id}`, { method: 'DELETE' })
