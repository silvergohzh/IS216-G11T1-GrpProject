// Seeds the data for Orders + Payments + Platform. Owner: M6
// Run: npm run seed   (runs seed.js first, then this file)
//   1. Gives every place a TYPE tag: hawker centre, food court or restaurant.
//   2. Restaurants get a menu (menus.json).
//   3. Hawker centres and food courts get STALLS inside them, each with its own menu (stalls.json).
//      A stall is a normal place with a parentId, e.g. "Ah Seng Chicken Rice" is inside "albert-centre".
//   4. Creates ready-made accounts (listed in the README) and gives the diners some Makan Points.
import { readFile } from 'fs/promises'
import { db, adminAuth } from '../firebase.js'

const places = db.collection('places')

// ---------- 1. Type tags ----------
// The seeded places say their type in the "cuisine" field, so we use that
const allPlaces = await places.get()
for (const doc of allPlaces.docs) {
  let type = 'restaurant'
  if (doc.data().cuisine === 'Hawker') type = 'hawker-centre'
  if (doc.data().cuisine === 'Food court') type = 'food-court'
  await doc.ref.update({ type: type })
}

// ---------- 2. Restaurant menus ----------
// menus.json: { placeId: [{ id, name, price }] }   price is in CENTS (450 = $4.50)
const menus = JSON.parse(await readFile(new URL('./menus.json', import.meta.url)))
for (const placeId in menus) {
  const snap = await places.doc(placeId).get()
  if (snap.exists) await snap.ref.update({ menu: menus[placeId] })
}

// ---------- 3. Stalls inside hawker centres and food courts ----------
const stalls = JSON.parse(await readFile(new URL('./stalls.json', import.meta.url)))
for (const stall of stalls) {
  const parent = (await places.doc(stall.parentId).get()).data()

  // Cheapest and dearest dish, in dollars (the voting shortlist uses dollars for the budget filter)
  const prices = stall.menu.map(dish => dish.price)

  await places.doc(stall.id).set({
    name: stall.name,
    type: 'stall',
    parentId: stall.parentId,
    parentName: parent.name,
    cuisine: stall.cuisine,
    address: parent.address,       // a stall is at the same address as its hawker centre
    lat: parent.lat,
    lng: parent.lng,
    priceMin: Math.min(...prices) / 100,
    priceMax: Math.max(...prices) / 100,
    dietary: stall.dietary,
    serviceModes: parent.serviceModes,
    menu: stall.menu,
    latest: null
  })
}
console.log(`Added menus to ${Object.keys(menus).length} restaurants and ${stalls.length} stalls inside hawker centres / food courts`)

// ---------- 4. Ready-made accounts ----------
// So nobody has to sign up to try the app. They are listed in the README.
const PASSWORD = 'test1234'
const accounts = [
  { email: 'alice@chopeless.test', name: 'Alice Tan', role: 'diner', placeId: null, points: 1000 },
  { email: 'ben@chopeless.test', name: 'Ben Lim', role: 'diner', placeId: null, points: 300 },
  { email: 'chloe@chopeless.test', name: 'Chloe Ng', role: 'diner', placeId: null, points: 300 },
  { email: 'hawker@chopeless.test', name: 'Ah Seng (hawker)', role: 'hawker', placeId: 'ah-seng-chicken-rice', points: 0 },
  { email: 'hawker2@chopeless.test', name: 'Waterloo Nasi Lemak (hawker)', role: 'hawker', placeId: 'waterloo-nasi-lemak', points: 0 },
  { email: 'admin@chopeless.test', name: 'Admin', role: 'admin', placeId: null, points: 0 },
  { email: 'dan@chopeless.test', name: 'Dan Koh', role: 'diner', placeId: null, points: 0 } // has a hawker application waiting (below)
]

for (const account of accounts) {
  // Reuse the account if it already exists, otherwise create it
  let user
  try {
    user = await adminAuth.getUserByEmail(account.email)
  } catch {
    user = await adminAuth.createUser({ email: account.email, password: PASSWORD })
  }

  // Save the profile with the role. Only the server can set "role" (see firestore.rules).
  await db.collection('users').doc(user.uid).set({
    name: account.name,
    defaultBudget: 8,
    dietary: [],
    role: account.role,
    placeId: account.placeId
  }, { merge: true })

  // Starting Makan Points, so the diners can try buying a Fastpass (it costs 150 points).
  // Re-running the seed puts the balance back to this number.
  await db.collection('pointsAccounts').doc(user.uid).set({ balance: account.points, lifetimePoints: account.points })
}
console.log(`Test accounts ready (password "${PASSWORD}"): ${accounts.map(a => a.email).join(', ')}`)

// ---------- 5. A hawker application waiting for the admin ----------
// So the admin page has something to approve straight away.
const dan = await adminAuth.getUserByEmail('dan@chopeless.test')
await db.collection('hawkerApplications').doc(dan.uid).set({
  uid: dan.uid,
  applicantName: 'Dan Koh',
  stallName: "Dan's Nasi Lemak",
  cuisine: 'Malay',
  address: '30 Victoria St, Singapore 187996',
  lat: 1.2969,
  lng: 103.8526,
  dietary: ['halal'],
  serviceModes: ['dine-in', 'takeaway'],
  parentId: null,
  status: 'pending',
  reason: '',
  createdAt: new Date()
})
console.log("Hawker application waiting for approval: Dan's Nasi Lemak (dan@chopeless.test)")
process.exit(0)
