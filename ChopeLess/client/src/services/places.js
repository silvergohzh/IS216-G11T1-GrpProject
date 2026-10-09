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

// Shrink a photo to at most 1024px and turn it into base64 JPEG.
// Phone photos are often 5MB+, which is too big to send and slower for the AI.
export function shrinkPhoto(file, maxSize = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => reject(new Error('That file is not a photo we can read'))
    img.src = URL.createObjectURL(file)
  })
}

// The OpenAI key is secret, so photos go through our server
export const analysePhoto = (id, dataUrl) =>
  api(`/places/${id}/analyse`, { method: 'POST', body: { imageBase64: dataUrl.split(',')[1], mimeType: 'image/jpeg' } })
