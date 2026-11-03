// Demo hawkers and orders, so whichever place wins the vote, its hawker can log in
// and the Order board already has orders on it. Owner: M6
// Run: npm run seed        (runs this last, after seed.js and platform.js)
//  or: npm run seed:demo   (only this file: safe for the live database, it does NOT wipe places or points)
//   1. One hawker account for EVERY place that takes orders (each restaurant and each stall).
//      Ah Seng Chicken Rice and Waterloo Nasi Lemak keep hawker@ and hawker2@. The others are
//      <place id>@chopeless.test, e.g. albert-laksa@chopeless.test. Password: test1234.
//   2. Three demo orders on every board: two paid and waiting, one being prepared,
//      plus one collected order in the History tab. Paid with a demo payment, so Earnings has them too.
//      The customers are made-up names, not real accounts, so the demo works with any users who
//      sign up (nobody's real orders are touched). Demo orders are never Fastpass, so a real
//      Fastpass order still goes to the top of the board.
//   Re-running deletes the old demo orders first (they are marked demo: true), so they don't pile up.
import { randomUUID } from 'crypto'
import { db, adminAuth } from '../firebase.js'

const PASSWORD = 'test1234'
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const orders = db.collection('orders')
const payments = db.collection('payments')

// The two stalls that already had a hawker keep their old email (the tests and README use them)
const KNOWN_HAWKERS = {
  'ah-seng-chicken-rice': 'hawker@chopeless.test',
  'waterloo-nasi-lemak': 'hawker2@chopeless.test'
}

// Finds an account by email, or makes it if it doesn't exist yet
async function getOrCreateUser(email) {
  try {
    return await adminAuth.getUserByEmail(email)
  } catch {
    return await adminAuth.createUser({ email: email, password: PASSWORD })
  }
}

// 6 random letters, like the join codes the server makes
function makeJoinCode() {
  let code = ''
  for (let i = 0; i < 6; i++) code = code + CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]
  return code
}

// A time some minutes ago, so the board shows the orders oldest first
const minutesAgo = minutes => new Date(Date.now() - minutes * 60 * 1000)

// ---------- 1. A hawker for every place that takes orders ----------
const placesSnap = await db.collection('places').get()
const orderable = placesSnap.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(p => p.menu && p.menu.length > 0) // hawker centres and food courts have stalls instead of a menu
  .filter(p => !p.ownerUid)                 // a stall approved by the admin already has its real hawker

const hawkers = []
for (const place of orderable) {
  const email = KNOWN_HAWKERS[place.id] || `${place.id}@chopeless.test`
  const user = await getOrCreateUser(email)
  await db.collection('users').doc(user.uid).set({
    name: `${place.name} (hawker)`,
    defaultBudget: 8,
    dietary: [],
    role: 'hawker',
    placeId: place.id
  }, { merge: true })
  hawkers.push({ email, place })
}

// ---------- 2. Demo orders on every board ----------
// Made-up customers: just a name on the order, with no account behind it (nobody can log in as them)
const weiMing = { uid: 'demo-customer-1', name: 'Wei Ming' }
const priya = { uid: 'demo-customer-2', name: 'Priya' }
const farah = { uid: 'demo-customer-3', name: 'Farah' }
const junHao = { uid: 'demo-customer-4', name: 'Jun Hao' }

// Remove the old demo orders (and their payment records) first
const oldDemo = await orders.where('demo', '==', true).get()
for (const doc of oldDemo.docs) {
  await payments.doc(doc.id).delete()
  await doc.ref.delete()
}

// One cart line, in the same shape the server saves (price in cents)
function line(dish, qty, person) {
  return { lineId: randomUUID(), itemId: dish.id, name: dish.name, price: dish.price, qty: qty, addedBy: person.uid, addedByName: person.name }
}

// Saves one demo order and, if it was paid, its payment record (like markOrderPaid does)
async function addDemoOrder(place, { owner, members, items, status, placedMinutesAgo, extra = {} }) {
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0)
  const ref = orders.doc()
  await ref.set({
    placeId: place.id,
    placeName: place.name,
    ownerUid: owner.uid,
    joinCode: makeJoinCode(),
    members: members,
    memberUids: members.map(m => m.uid),
    sessionCode: null,
    priority: false,
    items: items,
    total: total,
    status: status,
    createdAt: minutesAgo(placedMinutesAgo + 2),
    paidAt: minutesAgo(placedMinutesAgo),
    demo: true,
    ...extra
  })
  await payments.doc(ref.id).set({
    orderId: ref.id,
    placeId: place.id,
    placeName: place.name,
    payerUid: owner.uid,
    payerName: owner.name,
    memberUids: members.map(m => m.uid),
    amount: total,
    method: 'demo',
    paymentIntent: '',
    status: 'paid',
    paidAt: minutesAgo(placedMinutesAgo).getTime(),
    updatedAt: Date.now()
  })
}

let orderCount = 0
for (const { place } of hawkers) {
  const menu = place.menu
  const dish = i => menu[i % menu.length] // wraps around for short menus

  // Collected earlier today (History tab)
  const collectedAt = Date.now() - 90 * 60 * 1000
  await addDemoOrder(place, {
    owner: junHao, members: [junHao], items: [line(dish(0), 1, junHao)],
    status: 'collected', placedMinutesAgo: 110,
    extra: { readyAt: collectedAt - 5 * 60 * 1000, pickupBy: collectedAt + 10 * 60 * 1000, collectedAt: collectedAt, collectedByName: junHao.name }
  })
  // Being prepared
  await addDemoOrder(place, {
    owner: farah, members: [farah], items: [line(dish(1), 2, farah)],
    status: 'preparing', placedMinutesAgo: 12
  })
  // Paid and waiting: a group order (Wei Ming paid for him and Priya) and a solo order
  await addDemoOrder(place, {
    owner: weiMing, members: [weiMing, priya], items: [line(dish(0), 1, weiMing), line(dish(2), 1, priya)],
    status: 'paid', placedMinutesAgo: 8
  })
  await addDemoOrder(place, {
    owner: priya, members: [priya], items: [line(dish(1), 1, priya)],
    status: 'paid', placedMinutesAgo: 4
  })
  orderCount = orderCount + 4
}

console.log(`Demo hawkers ready (password "${PASSWORD}"):`)
for (const { email, place } of hawkers) console.log(`  ${email.padEnd(42)} ${place.name}${place.parentName ? ` (inside ${place.parentName})` : ''}`)
console.log(`Added ${orderCount} demo orders: 2 waiting, 1 preparing and 1 collected on every board`)
process.exit(0)
