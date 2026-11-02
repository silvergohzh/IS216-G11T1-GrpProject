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

  // Hidden gems: when a gem gets enough upvotes, gems.js (M5) copies it into "places" with fromGem: true.
  // That copy is the gem's only entry, so we don't read the "gems" collection here (that made duplicates).
  // We mark the copy as a gem here instead of in the database, so copies made before this change work too.
  return places.map(p => (p.fromGem ? { ...p, isGem: true } : p))
}

// The middle number of a list (or the average of the two middle ones if the list has an even length).
// An empty list gives 0.
function median(numbers) {
  if (numbers.length === 0) return 0
  const sorted = [...numbers].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
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
  // A place with no queue number yet is "unknown". We don't pretend it has no queue (0 minutes):
  // its waitMins is null (Firestore can't save undefined) and waitUnknown is true, so the card can say so.
  for (const p of places) {
    const wait = p.latest?.waitMins
    if (Number.isFinite(wait)) {
      p.waitMins = wait
      p.waitUnknown = false
    } else {
      p.waitMins = null
      p.waitUnknown = true
    }
  }

  // For sorting only: an unknown place counts as the median wait of the places we DO know
  // (out of everything that passed steps 1 to 4). If we know none, it counts as 0.
  // This guess is never saved as waitMins, so a card never shows a made-up number.
  const guessedWait = median(places.filter(p => !p.waitUnknown).map(p => p.waitMins))

  // The wait limit only checks places whose wait we know. Unknown places stay in.
  places = places.filter(p => p.waitUnknown || p.waitMins <= session.maxWaitMins)

  // Step 6: sort by total time = walk + wait (an unknown wait counts as the median from above)
  const waitForSorting = p => (p.waitUnknown ? guessedWait : p.waitMins)
  places.sort((a, b) => (a.walkMins + waitForSorting(a)) - (b.walkMins + waitForSorting(b)))

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
    latest: p.latest ?? null,
    waitMins: p.waitMins ?? null   // an unknown wait stays null (never undefined)
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

