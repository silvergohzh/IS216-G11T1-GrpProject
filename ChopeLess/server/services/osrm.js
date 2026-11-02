// Walking time and route between two points. Owner: M2
// Uses the public OSRM foot-routing server. Falls back to a straight-line estimate if it is down.

const OSRM_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'

// Offline mode: with OSRM_OFFLINE=true (the e2e tests set it), we never call the internet
// and always use the straight-line estimate. That keeps test results the same every run.
// We check it on every call, so it works no matter when the setting is loaded.
const isOffline = () => process.env.OSRM_OFFLINE === 'true'

// When OSRM is down we fall back to a straight line, and print a warning so we know why.
// At most once a minute: one shortlist asks about up to 14 places, and 14 identical lines would just be noise.
// (Offline mode never gets here, because it doesn't try OSRM at all.)
const WARN_EVERY_MS = 60 * 1000
let lastWarnAt = null   // when we last printed the warning (null = never)

function warnFallback(err, fallback) {
  const now = Date.now()
  if (lastWarnAt !== null && now - lastWarnAt < WARN_EVERY_MS) return   // warned less than a minute ago
  lastWarnAt = now
  console.warn(`OSRM unavailable (${err.message}), using ${fallback}`)
}

function straightLineMinutes(a, b) {
  const R = 6371 // km
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  const km = 2 * R * Math.asin(Math.sqrt(h))
  return Math.round(km / 5 * 60 * 1.3) // 5 km/h, +30% because streets are not straight
}

async function osrmRoute(from, to, query) {
  const res = await fetch(`${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?${query}`)
  if (!res.ok) throw new Error('OSRM ' + res.status)
  const data = await res.json()
  return data.routes[0]
}

export async function walkingMinutes(from, to) {
  if (isOffline()) return straightLineMinutes(from, to)
  try {
    const route = await osrmRoute(from, to, 'overview=false')
    return Math.round(route.duration / 60)
  } catch (err) {
    warnFallback(err, 'straight-line estimate')
    return straightLineMinutes(from, to)
  }
}

// The path to draw on the map, as [[lat, lng], ...] (the order Leaflet wants). A straight line if OSRM is down.
export async function walkingRoute(from, to) {
  if (isOffline()) return [[from.lat, from.lng], [to.lat, to.lng]]
  try {
    const route = await osrmRoute(from, to, 'overview=full&geometries=geojson')
    return route.geometry.coordinates.map(([lng, lat]) => [lat, lng]) // GeoJSON is [lng, lat]
  } catch (err) {
    warnFallback(err, 'a straight line')
    return [[from.lat, from.lng], [to.lat, to.lng]]
  }
}
