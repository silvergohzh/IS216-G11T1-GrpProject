// Split a group order's bill between the people in the group. Owner: M6
//
// IMPORTANT: all money is in CENTS (whole numbers), never dollars.
// Computers store decimals like 0.1 + 0.2 as 0.30000000000000004, which can lose a cent.
// Whole numbers never have that problem, so $3.50 is stored as 350.
//
// An item in the cart looks like:
//   { name: 'Chicken rice', price: 450, qty: 2, addedBy: 'uid123' }
// A member of the group looks like:
//   { uid: 'uid123', name: 'myat' }

// Total of the whole cart, in cents
export function totalCents(items) {
  let total = 0
  for (const item of items) {
    total = total + item.price * item.qty
  }
  return total
}

// SPLIT BY ITEM: everyone pays for exactly what they added to the cart.
// The shares always add up to the total, because each item belongs to exactly one person.
export function splitByItem(items, members) {
  const shares = []
  for (const member of members) {
    let amount = 0
    for (const item of items) {
      if (item.addedBy === member.uid) {
        amount = amount + item.price * item.qty
      }
    }
    shares.push({ uid: member.uid, name: member.name, amount: amount })
  }
  return shares
}

// SPLIT EQUALLY: the total is shared evenly between everyone in the group.
// The tricky part: the total does not always divide evenly.
//   Example: $10.00 (1000 cents) between 3 people is 333.33... cents each.
//   If everyone paid 333 cents, the group would only pay 999 cents and be 1 cent short.
// The fix: everyone pays the rounded-down amount, then the leftover cents
// are handed out one at a time to the first people in the list.
//   1000 cents between 3 people -> 334 + 333 + 333 = 1000 (exact)
export function splitEqually(items, members) {
  if (members.length === 0) return []

  const total = totalCents(items)
  const basicShare = Math.floor(total / members.length)        // 333
  let leftoverCents = total - basicShare * members.length      // 1000 - 999 = 1

  const shares = []
  for (const member of members) {
    let amount = basicShare
    if (leftoverCents > 0) {
      amount = amount + 1
      leftoverCents = leftoverCents - 1
    }
    shares.push({ uid: member.uid, name: member.name, amount: amount })
  }
  return shares
}

// Turn cents into a price people can read: 350 -> "$3.50"
export function formatMoney(cents) {
  return '$' + (cents / 100).toFixed(2)
}

