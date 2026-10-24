// Seeds the data for Orders + Payments + Platform. Owner: M6
// Run: npm run seed   (runs seed.js first, then this file)
//   1. Adds a menu to every place, so diners have something to order.
//   2. Creates one test account for each role, for the graders and the Playwright tests.
import { readFile } from 'fs/promises'
import { db, adminAuth } from '../firebase.js'

// ---------- 1. Menus ----------
// menus.json: { placeId: [{ id, name, price }] }   price is in CENTS (450 = $4.50)
const menus = JSON.parse(await readFile(new URL('./menus.json', import.meta.url)))

for (const placeId in menus) {
  const ref = db.collection('places').doc(placeId)
  const snap = await ref.get()
  if (snap.exists) {
    await ref.update({ menu: menus[placeId] })
  }
}
console.log(`Added menus to ${Object.keys(menus).length} places`)

// ---------- 2. Ready-made accounts ----------
// So nobody has to sign up to try the app. The login page has a one-tap button for each.
// Keep this list the same as client/src/lib/demoAccounts.js
const PASSWORD = 'test1234'
const accounts = [
  { email: 'alice@chopeless.test', name: 'Alice Tan', role: 'diner', placeId: null },
  { email: 'ben@chopeless.test', name: 'Ben Lim', role: 'diner', placeId: null },
  { email: 'chloe@chopeless.test', name: 'Chloe Ng', role: 'diner', placeId: null },
  { email: 'hawker@chopeless.test', name: 'Albert Centre Hawker', role: 'hawker', placeId: 'albert-centre' },
  { email: 'hawker2@chopeless.test', name: 'Waterloo Centre Hawker', role: 'hawker', placeId: 'waterloo-centre' },
  { email: 'admin@chopeless.test', name: 'Admin', role: 'admin', placeId: null },
  { email: 'dan@chopeless.test', name: 'Dan Koh', role: 'diner', placeId: null } // has a hawker application waiting (below)
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
}
console.log(`Test accounts ready (password "${PASSWORD}"): ${accounts.map(a => a.email).join(', ')}`)

// ---------- 3. A hawker application waiting for the admin ----------
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
  status: 'pending',
  reason: '',
  createdAt: new Date()
})
console.log("Hawker application waiting for approval: Dan's Nasi Lemak (dan@chopeless.test)")
process.exit(0)
