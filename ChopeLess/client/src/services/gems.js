// Hidden Gems data. Owner: M5
// Firestore: gems/{id} { name, mustTry, price, address, lat, lng, dietary, submittedBy, upvoters: [uid], createdAt }
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

// READ (live): the board updates by itself when anyone adds or upvotes a gem
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

// Reviews
export const getReviews = id => api(`/${id}/reviews`, 'GET')
export const saveReview = (id, review) => api(`/${id}/reviews`, 'POST', review)
export const deleteReview = id => api(`/${id}/reviews`, 'DELETE')
export const updateReview = (id, review) => api(`/${id}/reviews`, 'PUT', review)