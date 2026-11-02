// Shortlist engine. Owner: M2 (Shortlist engine and maps)
// Turns a session (members + host settings) into a ranked list of places.
import { db } from '../firebase.js'
import { walkingMinutes } from './osrm.js'

const SHORTLIST_SIZE = 8

async function loadCandidates() {
  const placesSnap = await db.collection('places').get()
  // [SILVER] START: Hawker centres, food courts, stalls & place tags (built by Myat, see HANDOVER.md)
  // Stalls inside a hawker centre or food court (parentId) are not voted on by themselves:
  // the group votes for the centre, then picks a stall when pre-ordering (M6)
  const places = placesSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.parentId)
  // [SILVER] END

  // Hidden gems: when a gem gets enough upvotes, gems.js (M5) copies it into "places" with fromGem: true.
  // That copy is the gem's only entry, so we don't read the "gems" collection here (that made duplicates).
  // We mark the copy as a gem here instead of in the database, so copies made before this change work too.
  return places.map(p => (p.fromGem ? { ...p, isGem: true } : p))
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
  // Firestore can't save "undefined", so fill in any missing fields.
  // This way one incomplete place or gem can't break Start voting.
  return top.map(p => ({
    ...p,
    priceMin: p.priceMin ?? p.priceMax ?? 0,
    priceMax: p.priceMax ?? p.priceMin ?? 0,
    cuisine: p.cuisine ?? '',
    address: p.address ?? '',
    dietary: p.dietary || [],
    latest: p.latest ?? null
  }))
}
