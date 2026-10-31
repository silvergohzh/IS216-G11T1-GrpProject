// Hidden Gems data. Owner: M5
// Firestore: gems/{id} { name, mustTry, cuisine, address, lat, lng, priceMin, priceMax, dietary, serviceModes,
//                        waitMins, imageUrl, submittedBy, upvoters: [uid], ratingSum, ratingCount, createdAt }
// READ of the board goes straight to Firestore (live). WRITES and reviews go through the Express API.

import { collection, onSnapshot } from 'firebase/firestore'
import { db, auth } from '../lib/firebase'

export const UPVOTES_NEEDED = 3

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

// Calls the gems API. Sends the login token when logged in. Throws an Error with the server's message.
async function api(path, method, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`
  const res = await fetch(`${API}/gems${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

// READ (live): the board updates by itself when anyone adds, upvotes or reviews a gem
export function watchGems(onChange, onError) {
  return onSnapshot(collection(db, 'gems'), snap => {
    const gems = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    gems.sort((a, b) => b.upvoters.length - a.upvoters.length)
    onChange(gems)
  }, onError)
}

export const addGem = gem => api('', 'POST', gem)
export const updateGem = (id, gem) => api(`/${id}`, 'PUT', gem)
export const deleteGem = id => api(`/${id}`, 'DELETE')
export const upvoteGem = id => api(`/${id}/upvote`, 'POST')
export const unvoteGem = id => api(`/${id}/upvote`, 'DELETE')

// Reviews (as many as you like per gem)
export const getReviews = id => api(`/${id}/reviews`, 'GET')
export const saveReview = (id, review) => api(`/${id}/reviews`, 'POST', review)
export const updateReview = (id, reviewId, review) => api(`/${id}/reviews/${reviewId}`, 'PUT', review)
export const deleteReview = (id, reviewId) => api(`/${id}/reviews/${reviewId}`, 'DELETE')

// Shrinks a photo in the browser to a small JPEG data URL (about 800px wide) so it fits in the gem document
export async function photoToDataUrl(file) {
  const bitmap = await createImageBitmap(file)
  for (const [maxSize, quality] of [[800, 0.7], [640, 0.6], [480, 0.5]]) {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const url = canvas.toDataURL('image/jpeg', quality)
    if (url.length <= 350000) return url
  }
  throw new Error('That photo is too large')
}