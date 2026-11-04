// [SILVER] Island ticks: which stations I've been to today. Owner: M3
// Saved to my account at users/{uid}/visited/{today's date}, so every device shows the same ticks,
// and a new day starts with an empty list.
import { doc, setDoc, arrayUnion } from 'firebase/firestore'
import { db } from './firebase'
import { todaySG } from './today'

// Which island station each page belongs to: [station id, start of the page's address]
const STATION_PAGES = [
  ['kakis', '/groups'],
  ['queues', '/queueless'],
  ['queues', '/places'],
  ['gems', '/gems'],
  ['session', '/sessions'],
  ['preorder', '/orders'],
  ['preorder', '/stalls'],
  ['points', '/points']
]

// '/sessions/ABCDEF/vote' -> 'session'. Pages that aren't a station (Home, Profile...) -> null
export function stationFor(path) {
  const match = STATION_PAGES.find(([, start]) => path === start || path.startsWith(start + '/'))
  return match ? match[0] : null
}

// Add a tick for today. arrayUnion never adds the same station twice.
export function markVisited(uid, stationId) {
  if (!uid || !stationId) return Promise.resolve()   // guests and non-station pages: nothing to save
  return setDoc(doc(db, 'users', uid, 'visited', todaySG()), { ids: arrayUnion(stationId) }, { merge: true })
    .catch(() => {})                                  // offline: just no tick this time
}