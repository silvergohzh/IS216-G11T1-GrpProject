// Shortlist engine. Owner: M2 (Shortlist engine and maps)
// Turns a session (members + host settings) into a ranked list of places.
import { db } from '../firebase.js'
import { walkingMinutes } from './osrm.js'

const GEM_UPVOTES_NEEDED = 3
const SHORTLIST_SIZE = 8

async function loadCandidates() {
  const placesSnap = await db.collection('places').get()
  const places = placesSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Hidden gems with 3+ upvotes join the pool (M5's data)
  const gemsSnap = await db.collection('gems').get()
  const gems = gemsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(g => (g.upvoters || []).length >= GEM_UPVOTES_NEEDED && g.lat)
    .map(g => ({
      id: 'gem-' + g.id, name: g.name, cuisine: g.mustTry, address: g.address, lat: g.lat, lng: g.lng,
      priceMin: g.price, priceMax: g.price, dietary: g.dietary || [], serviceModes: ['dine-in', 'takeaway'],
      isGem: true, latest: null
    }))

  return [...places, ...gems]
}

export async function buildShortlist(session) {
  let places = await loadCandidates()
  const members = Object.values(session.members)

  // Step 1: service mode (dine-in or takeaway)
  places = places.filter(p => (p.serviceModes || []).includes(session.serviceMode))

  // Step 2: budget. The group can only spend what the tightest budget allows.
  const budgetCap = Math.min(...members.map(m => m.budget ?? Infinity))
  places = places.filter(p => (p.priceMin ?? 0) <= budgetCap)

  // Step 3: dietary needs. Every member's needs must be served.
  const needs = [...new Set(members.flatMap(m => m.dietary || []))]
  places = places.filter(p => needs.every(n => (p.dietary || []).includes(n)))

  // Step 4: walking time from the meeting point
  const from = session.meetingPoint
  for (const p of places) p.walkMins = from?.lat ? await walkingMinutes(from, p) : 0
  places = places.filter(p => p.walkMins <= session.maxWalkMins)

  // Step 5: waiting time from the latest QueueLess estimate (M4's data)
  for (const p of places) p.waitMins = p.latest?.waitMins ?? 0
  places = places.filter(p => p.waitMins <= session.maxWaitMins)

  // Step 6: sort by total time = walk + wait
  places.sort((a, b) => (a.walkMins + a.waitMins) - (b.walkMins + b.waitMins))

  // Step 7: keep at least one hidden gem in the top results. If none made the cut, the best-ranked gem
  // takes the last slot. It is slower than everything above it, so the list stays sorted by total time.
  const top = places.slice(0, SHORTLIST_SIZE)
  if (!top.some(p => p.isGem)) {
    const gem = places.slice(SHORTLIST_SIZE).find(p => p.isGem)
    if (gem) top[top.length - 1] = gem
  }
  return top
}
