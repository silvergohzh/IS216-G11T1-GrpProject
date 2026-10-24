// Hawker sign-up, admin approval and menu management for the browser. Owner: M6
// READ the public menu: straight from Firestore (places/{id}.menu), anyone can see it.
// CHANGES: always through our server (server/routes/hawkers.js and admin.js).
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { api } from '../lib/api'

// A stall with its menu, live (updates by itself when the hawker edits the menu)
export function watchStall(placeId, onChange, onError) {
  return onSnapshot(doc(db, 'places', placeId), snap => {
    onChange(snap.exists() ? { id: snap.id, ...snap.data(), menu: snap.data().menu || [] } : null)
  }, onError)
}

// ---------- Applying to be a hawker ----------
export const applyAsHawker = details => api('/hawkers/apply', { method: 'POST', body: details })
export const getMyApplication = () => api('/hawkers/application')

// ---------- Admin ----------
export const getApplications = () => api('/admin/applications')
export const approveApplication = uid => api(`/admin/applications/${uid}/approve`, { method: 'POST' })
export const rejectApplication = (uid, reason) => api(`/admin/applications/${uid}/reject`, { method: 'POST', body: { reason } })

// ---------- Menu (hawker only). Prices are typed in dollars, e.g. "4.50" ----------
export const addDish = (name, price) => api('/hawkers/menu', { method: 'POST', body: { name, price } })
export const addManyDishes = items => api('/hawkers/menu/many', { method: 'POST', body: { items } })
export const updateDish = (dishId, changes) => api(`/hawkers/menu/${dishId}`, { method: 'PATCH', body: changes })
export const deleteDish = dishId => api(`/hawkers/menu/${dishId}`, { method: 'DELETE' })

// AI: read a photo of the menu board. Returns a draft list [{ name, price (cents) }] - not saved yet.
export const scanMenuPhoto = photo => api('/hawkers/menu/scan', { method: 'POST', body: { photo } })
