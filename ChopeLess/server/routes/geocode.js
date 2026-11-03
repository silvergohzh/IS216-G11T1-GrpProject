// Address lookup for the Hidden Gems form, using OpenStreetMap's Nominatim. Owner: M2 (Nawaz)
// GET /api/geocode?q=270 Queen Street   ->   { results: [{ label, lat, lng }] }
//
// Nominatim is a free service with strict rules, so we:
//   - send a User-Agent that says who we are
//   - call it at most once per second (extra lookups get a friendly "try again" message)
//   - remember answers for 10 minutes, so the same address isn't looked up twice
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'ChopeLess-student-project'
const CACHE_MS = 10 * 60 * 1000   // remember an answer for 10 minutes
const MIN_GAP_MS = 1000           // at most one call to Nominatim per second
const TIMEOUT_MS = 8000           // give up on Nominatim after 8 seconds

const cache = new Map()           // lowercase query -> { results, savedAt }
let lastCallAt = null             // when we last called Nominatim (null = never)

// Makes an error with an HTTP status code. The shared handler in index.js sends it to the browser.
const httpError = (status, message) => Object.assign(new Error(message), { status })

// Looks up an address and returns { results: [{ label, lat, lng }] } (an empty list if nothing matched).
// Exported so the tests can call it without logging in.
export async function lookupAddress(rawQuery) {
  const q = String(rawQuery ?? '').trim()
  if (q.length < 3 || q.length > 200) throw httpError(400, 'Enter an address between 3 and 200 characters')

  // 1. Asked recently? Answer from the cache (this doesn't count towards the one-per-second limit)
  const key = q.toLowerCase()
  const saved = cache.get(key)
  if (saved && Date.now() - saved.savedAt < CACHE_MS) return { results: saved.results }

  // 2. One call per second: if someone looked up an address less than a second ago, ask them to wait
  if (lastCallAt !== null && Date.now() - lastCallAt < MIN_GAP_MS) {
    throw httpError(429, 'Too many lookups at once. Wait a second and try again.')
  }
  lastCallAt = Date.now()   // claim this second before waiting, so two lookups at once can't both go

  // 3. Ask Nominatim (Singapore only, top 3 matches)
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=3&countrycodes=sg`
  let data
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) throw new Error('Nominatim ' + res.status)
    data = await res.json()
    if (!Array.isArray(data)) throw new Error('Nominatim sent something unexpected')
  } catch (err) {
    console.warn(`Address lookup failed (${err.message})`)
    throw httpError(502, "Address lookup isn't working right now. Tap the map instead.")
  }

  // 4. Keep only what the form needs, with lat and lng as numbers
  const results = data
    .map(place => ({ label: place.display_name, lat: Number(place.lat), lng: Number(place.lon) }))
    .filter(place => place.label && Number.isFinite(place.lat) && Number.isFinite(place.lng))

  cache.set(key, { results, savedAt: Date.now() })
  return { results }
}

const router = Router()

router.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json(await lookupAddress(req.query.q))
  } catch (err) {
    next(err)
  }
})

export default router
