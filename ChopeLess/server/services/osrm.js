// Walking time and route between two points. Owner: M2
// Uses the public OSRM foot-routing server. Falls back to a straight-line estimate if it is down.

const OSRM_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'

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
  try {
    const route = await osrmRoute(from, to, 'overview=false')
    return Math.round(route.duration / 60)
  } catch {
    return straightLineMinutes(from, to)
  }
}

// The path to draw on the map, as [[lat, lng], ...] (the order Leaflet wants). A straight line if OSRM is down.
export async function walkingRoute(from, to) {
  try {
    const route = await osrmRoute(from, to, 'overview=full&geometries=geojson')
    return route.geometry.coordinates.map(([lng, lat]) => [lat, lng]) // GeoJSON is [lng, lat]
  } catch {
    return [[from.lat, from.lng], [to.lat, to.lng]]
  }
}
