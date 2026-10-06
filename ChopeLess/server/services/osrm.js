// Walking time between two points. Owner: M2
// Uses the public OSRM foot-routing server. Falls back to a straight-line estimate if it is down.

function straightLineMinutes(a, b) {
  const R = 6371 // km
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  const km = 2 * R * Math.asin(Math.sqrt(h))
  return Math.round(km / 5 * 60 * 1.3) // 5 km/h, +30% because streets are not straight
}

export async function walkingMinutes(from, to) {
  try {
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`
    const res = await fetch(url)
    if (!res.ok) throw new Error('OSRM ' + res.status)
    const data = await res.json()
    return Math.round(data.routes[0].duration / 60)
  } catch {
    return straightLineMinutes(from, to)
  }
}
