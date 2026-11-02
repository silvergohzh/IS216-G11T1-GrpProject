// Shortlist engine. Owner: M2 (Shortlist engine and maps)
// Turns a session (members + host settings) into a ranked list of places.
import { db } from '../firebase.js'
import { walkingMinutes } from './osrm.js'


const SHORTLIST_SIZE = 8


async function loadCandidates() {
  const placesSnap = await db.collection('places').get()

  // [SILVER] START: Hawker centres, food courts, stalls & place tags
  // Stalls inside a hawker centre or food court are not voted on individually.
  // The group votes for the centre, then picks a stall when pre-ordering.
  const places = placesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => !p.parentId)
  // [SILVER] END

  // [JANANIJ] Promoted Hidden Gems (3+ upvotes) are already in "places".
  // This avoids duplicate Gems and preserves their QueueLess reports.
  return places
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

// [JANANIJ] START: QueueLess re-vote shortlist
// Finds alternatives with a confirmed shorter waiting time.
// Preserves the group's original service mode, budget,
// dietary requirements and walking-distance limit.


// [JANANIJ] START: QueueLess re-vote shortlist

export async function buildRevoteShortlist(session, rejectedWaitMins) {
  const members = Object.values(session.members || {})

  if (!members.length) return []

  if (
    typeof rejectedWaitMins !== 'number' ||
    !Number.isFinite(rejectedWaitMins) ||
    rejectedWaitMins <= 0
  ) return []

  const candidates = await loadCandidates()

  const budgetCap = Math.min(
    ...members.map(m => m.budget ?? Infinity)
  )

  const dietaryNeeds = [
    ...new Set(members.flatMap(m => m.dietary || []))
  ]

  const excludedIds = new Set([
    ...(session.rejectedWinnerIds || []),
    session.winner?.id,
    ...Object.values(session.vetoes || {})
  ].filter(Boolean).map(String))

  // [JANANIJ] Accept the latest available QueueLess report
  // regardless of age or confidence.
  const eligible = []

  for (const place of candidates) {
    // Preserve original group filters.
    if (excludedIds.has(String(place.id))) continue

    if (
      !(place.serviceModes || []).includes(session.serviceMode)
    ) continue

    if ((place.priceMin ?? 0) > budgetCap) continue

    if (
      !dietaryNeeds.every(
        need => (place.dietary || []).includes(need)
      )
    ) continue

    // Preserve walking-distance limit.
    const walkMins = session.meetingPoint?.lat != null
      ? await walkingMinutes(session.meetingPoint, place)
      : 0

    if (
      !Number.isFinite(walkMins) ||
      walkMins < 0 ||
      walkMins > (session.maxWalkMins ?? 10)
    ) continue

    // QueueLess report must have a known waiting time.
    const latest = place.latest ?? null
    const waitMins = latest?.waitMins

    if (
      typeof waitMins !== 'number' ||
      !Number.isFinite(waitMins) ||
      waitMins < 0
    ) continue



    // Must be faster than the rejected winner.
    if (waitMins >= rejectedWaitMins) continue

    // Preserve the original maximum waiting-time limit.
    if (waitMins > (session.maxWaitMins ?? 15)) continue

    eligible.push({
      ...place,
      walkMins,
      waitMins,
      latest
    })
  }

  eligible.sort(
    (a, b) =>
      (a.walkMins + a.waitMins) -
      (b.walkMins + b.waitMins)
  )

  return eligible.slice(0, SHORTLIST_SIZE).map(place => ({
    ...place,
    priceMin: place.priceMin ?? place.priceMax ?? 0,
    priceMax: place.priceMax ?? place.priceMin ?? 0,
    cuisine: place.cuisine ?? '',
    address: place.address ?? '',
    dietary: place.dietary || [],
    latest: place.latest ?? null
  }))
}

// [JANANIJ] END

