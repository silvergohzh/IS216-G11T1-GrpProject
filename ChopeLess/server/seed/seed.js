// Loads sample places and QueueLess history into Firestore. Owner: M5 (places), M4 (history)
// Run: npm run seed   (replaces the places collection)
// TODO (M5): add the rest of the 10-15 places near SMU to places.json, with real prices.
import { readFile } from 'fs/promises'
import { db } from '../firebase.js'

const places = JSON.parse(await readFile(new URL('./places.json', import.meta.url)))

// Remove old places (and their analyses) first so the seed can be re-run safely
const old = await db.collection('places').get()
for (const doc of old.docs) await db.recursiveDelete(doc.ref)

// Fake history so the hourly chart has data on day one (M4 can make this more realistic)
const lunchPeak = h => (h >= 11 && h <= 13 ? 1 : h >= 18 && h <= 19 ? 0.7 : 0.25)

for (const p of places) {
  const { id, latestWaitMins, ...data } = p
  const ref = db.collection('places').doc(id)
  await ref.set({ ...data, latest: { peopleInQueue: Math.round(latestWaitMins / 0.8), waitMins: latestWaitMins, seatOccupancy: latestWaitMins * 6, confidence: 'medium', at: new Date().toISOString() } })

  const batch = db.batch()
  for (let hour = 8; hour <= 21; hour++) {
    const people = Math.round(25 * lunchPeak(hour) + Math.random() * 5)
    batch.set(ref.collection('analyses').doc(), {
      hour, peopleInQueue: people, waitMins: Math.round(people * 0.8),
      seatOccupancy: Math.min(100, Math.round(100 * lunchPeak(hour) + Math.random() * 10)), confidence: 'medium'
    })
  }
  await batch.commit()
}

console.log(`Seeded ${places.length} places into ${process.env.FIRESTORE_EMULATOR_HOST ? 'the emulator' : 'Firebase project ' + process.env.FIREBASE_PROJECT_ID}`)
process.exit(0)
