// Calls our Express server (only for trusted actions: start voting, vote, analyse photo).
// Everything else talks to Firestore directly through src/services/.
// Usage:  await api('/sessions/ABCDEF/vote', { method: 'POST', body: { placeId, yes: true } })
import { auth } from './firebase'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth.currentUser) headers.Authorization = 'Bearer ' + (await auth.currentUser.getIdToken())

  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}
