// Orders data for the browser. Owner: M6
// READ: live from Firestore (onSnapshot), so carts and the hawker board update by themselves.
// CHANGES: always through our server (src/lib/api.js -> server/routes/orders.js),
//          so the server can check prices and nobody can mark their own order as paid.
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { api } from '../lib/api'

// What each status looks like to people
export const STATUS_LABELS = {
  cart: 'In cart',
  awaiting_payment: 'Waiting for payment',
  paid: 'Paid',
  preparing: 'Preparing',
  ready: 'Ready for pickup',
  collected: 'Collected',
  cancelled: 'Cancelled'
}

// Orders that are finished go into "history"
export function isFinished(order) {
  return order.status === 'collected' || order.status === 'cancelled'
}

// A short code to show at the stall, e.g. "#4F7Q" (the last 4 letters of the order id)
export function orderCode(orderId) {
  return '#' + orderId.slice(-4).toUpperCase()
}

// ---------- READ ----------

// A stall's details for ordering and pickup: { name, address, lat, lng, menu: [{ id, name, price }] }
export async function getStall(placeId) {
  const snap = await getDoc(doc(db, 'places', placeId))
  if (!snap.exists()) return null
  const place = snap.data()
  return { name: place.name, address: place.address, lat: place.lat, lng: place.lng, menu: place.menu || [] }
}

// One order, e.g. the cart page
export function watchOrder(orderId, onChange, onError) {
  return onSnapshot(doc(db, 'orders', orderId), snap => {
    onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  }, onError)
}

// The proof photos of one order: { ready: {...}, collected: {...} }
export function watchProofs(orderId, onChange, onError) {
  return onSnapshot(collection(db, 'orders', orderId, 'proofs'), snap => {
    const proofs = {}
    snap.docs.forEach(d => (proofs[d.id] = d.data()))
    onChange(proofs)
  }, onError)
}

// Every order I am part of, newest first
export function watchMyOrders(uid, onChange, onError) {
  const q = query(collection(db, 'orders'), where('memberUids', 'array-contains', uid))
  return onSnapshot(q, snap => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    onChange(list)
  }, onError)
}

// Every order for one stall: the hawker's live order board
export function watchStallOrders(placeId, onChange, onError) {
  const q = query(collection(db, 'orders'), where('placeId', '==', placeId))
  return onSnapshot(q, snap => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    list.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)) // oldest first
    onChange(list)
  }, onError)
}

// ---------- CHANGES (through the server) ----------

export const createOrder = placeId => api('/orders', { method: 'POST', body: { placeId } })
export const joinByCode = code => api('/orders/join', { method: 'POST', body: { code } })
export const addItem = (orderId, itemId, qty) => api(`/orders/${orderId}/items`, { method: 'POST', body: { itemId, qty } })
export const changeQty = (orderId, lineId, qty) => api(`/orders/${orderId}/items/${lineId}`, { method: 'PATCH', body: { qty } })
export const removeItem = (orderId, lineId) => api(`/orders/${orderId}/items/${lineId}`, { method: 'DELETE' })
export const cancelOrder = orderId => api(`/orders/${orderId}/cancel`, { method: 'POST' })
export const checkout = orderId => api(`/orders/${orderId}/checkout`, { method: 'POST' })

// Hawker: start cooking, then mark ready with a photo (starts the 15-minute pickup timer)
export const startPreparing = orderId => api(`/orders/${orderId}/preparing`, { method: 'POST' })
export const markReady = (orderId, photo) => api(`/orders/${orderId}/ready`, { method: 'POST', body: { photo } })

// Diner: mark collected with a photo of the food they picked up
export const markCollected = (orderId, photo) => api(`/orders/${orderId}/collect`, { method: 'POST', body: { photo } })
