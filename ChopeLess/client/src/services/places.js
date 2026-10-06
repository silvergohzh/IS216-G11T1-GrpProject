// Places and QueueLess data. Owner: M4
// Firestore: places/{id} { name, cuisine, address, lat, lng, priceMin, priceMax, dietary, serviceModes,
//                          latest: { peopleInQueue, waitMins, seatOccupancy, confidence, at } }
//            places/{id}/analyses/{id} { hour, peopleInQueue, waitMins, seatOccupancy, confidence }
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { api } from '../lib/api'

export async function listPlaces() {
  const snap = await getDocs(collection(db, 'places'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// One place plus the average wait for each hour (for the chart)
export async function getPlace(id) {
  const snap = await getDoc(doc(db, 'places', id))
  if (!snap.exists()) throw new Error('Place not found')

  const history = await getDocs(collection(db, 'places', id, 'analyses'))
  const byHour = {}
  history.forEach(d => {
    const a = d.data()
    byHour[a.hour] ??= { total: 0, count: 0 }
    byHour[a.hour].total += a.waitMins
    byHour[a.hour].count++
  })
  const trend = Object.keys(byHour).map(Number).sort((a, b) => a - b)
    .map(hour => ({ hour, avgWait: byHour[hour].total / byHour[hour].count }))

  return { id: snap.id, ...snap.data(), trend }
}

// The Gemini key is secret, so photos go through our server
export const analysePhoto = (id, imageBase64) => api(`/places/${id}/analyse`, { method: 'POST', body: { imageBase64 } })
