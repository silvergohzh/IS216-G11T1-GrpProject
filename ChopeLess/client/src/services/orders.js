// Orders data for the browser. Owner: M6
// READ: live from Firestore (onSnapshot), so carts and the hawker board update by themselves.
// CHANGES: always through our server (src/lib/api.js -> server/routes/orders.js),
//          so the server can check prices and nobody can mark their own order as paid.
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore'
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

// A place's details for ordering and pickup:
//   { id, name, type, parentId, parentName, address, lat, lng, menu: [{ id, name, price }] }
// [SILVER] getStall also returns type, parentId and parentName for the tags
// type is 'hawker-centre', 'food-court', 'stall' (inside a centre) or 'restaurant'
export async function getStall(placeId) {
  const snap = await getDoc(doc(db, 'places', placeId))
  if (!snap.exists()) return null
  const place = snap.data()
  return {
    id: snap.id,
    name: place.name,
    type: place.type || 'restaurant',
    parentId: place.parentId || null,
    parentName: place.parentName || null,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    menu: place.menu || []
  }
}

// [SILVER] START: Hawker centres, food courts, stalls & place tags (built by Myat, see HANDOVER.md)
// The stalls inside a hawker centre or food court
export async function listStallsInside(parentId) {
  const snap = await getDocs(query(collection(db, 'places'), where('parentId', '==', parentId)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// Every place you can order from (stalls inside centres + restaurants with a menu), e.g. for the admin page
export async function listOrderablePlaces() {
  const snap = await getDocs(collection(db, 'places'))
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  return all.filter(p => p.menu && p.menu.length > 0)
}
// [SILVER] END

// A Makan Session (to pre-order from the place the group picked)
export async function getSession(code) {
  const snap = await getDoc(doc(db, 'sessions', code))
  return snap.exists() ? { code: snap.id, ...snap.data() } : null
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

// sessionCode is optional: from a Makan Session, the whole group is added to the order
export const createOrder = (placeId, sessionCode) => api('/orders', { method: 'POST', body: { placeId, sessionCode } })
export const joinByCode = code => api('/orders/join', { method: 'POST', body: { code } })
export const addItem = (orderId, itemId, qty) => api(`/orders/${orderId}/items`, { method: 'POST', body: { itemId, qty } })
export const changeQty = (orderId, lineId, qty) => api(`/orders/${orderId}/items/${lineId}`, { method: 'PATCH', body: { qty } })
export const removeItem = (orderId, lineId) => api(`/orders/${orderId}/items/${lineId}`, { method: 'DELETE' })
export const cancelOrder = orderId => api(`/orders/${orderId}/cancel`, { method: 'POST' })
export const checkout = orderId => api(`/orders/${orderId}/checkout`, { method: 'POST' })

// Hawker: start cooking, then mark ready with a photo (starts the 15-minute pickup timer)
export const startPreparing = orderId => api(`/orders/${orderId}/preparing`, { method: 'POST' })
export const markReady = (orderId, photo) => api(`/orders/${orderId}/ready`, { method: 'POST', body: { photo } })

// [NAWAZ] START: Fastpass & Makan Points in pre-orders (built by Myat, see HANDOVER.md)
// Group leader: spend Makan Points on a Fastpass, so the hawker prepares this order first
export const buyFastpass = orderId => api(`/orders/${orderId}/fastpass`, { method: 'POST' })

// Where this order is in the stall's queue: { position, waiting }   (position 0 = not waiting in the queue)
export const getQueuePosition = orderId => api(`/orders/${orderId}/queue`)

// My Makan Points balance (Janani's points API): { balance, ... }
export const getMyPoints = () => api('/points/me')
// [NAWAZ] END

// Diner: mark collected with a photo of the food they picked up
export const markCollected = (orderId, photo) => api(`/orders/${orderId}/collect`, { method: 'POST', body: { photo } })
