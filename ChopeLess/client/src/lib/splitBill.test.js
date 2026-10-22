// Unit tests for the split-bill algorithm. Owner: M6
// Run with:  npm run test:unit   (uses Node's built-in test runner, nothing to install)
import test from 'node:test'
import assert from 'node:assert/strict'
import { totalCents, splitByItem, splitEqually, formatMoney } from './splitBill.js'

const members = [
  { uid: 'a', name: 'Alice' },
  { uid: 'b', name: 'Ben' },
  { uid: 'c', name: 'Chloe' }
]

test('total adds up price x quantity', () => {
  const items = [
    { price: 450, qty: 2, addedBy: 'a' }, // 900
    { price: 300, qty: 1, addedBy: 'b' }  // 300
  ]
  assert.equal(totalCents(items), 1200)
})

test('split by item: everyone pays for what they added', () => {
  const items = [
    { price: 450, qty: 2, addedBy: 'a' },
    { price: 300, qty: 1, addedBy: 'b' }
  ]
  const shares = splitByItem(items, members)
  assert.equal(shares[0].amount, 900) // Alice
  assert.equal(shares[1].amount, 300) // Ben
  assert.equal(shares[2].amount, 0)   // Chloe added nothing
})

test('split equally: $10.00 between 3 people adds up exactly', () => {
  const items = [{ price: 1000, qty: 1, addedBy: 'a' }]
  const shares = splitEqually(items, members)
  assert.deepEqual(shares.map(s => s.amount), [334, 333, 333])

  const sum = shares[0].amount + shares[1].amount + shares[2].amount
  assert.equal(sum, 1000) // not 999: no cent goes missing
})

test('split equally: an even total has no leftover', () => {
  const items = [{ price: 300, qty: 3, addedBy: 'a' }] // 900
  assert.deepEqual(splitEqually(items, members).map(s => s.amount), [300, 300, 300])
})

test('split equally with nobody in the group returns nothing', () => {
  assert.deepEqual(splitEqually([{ price: 500, qty: 1 }], []), [])
})

test('money is shown in dollars with two decimals', () => {
  assert.equal(formatMoney(350), '$3.50')
  assert.equal(formatMoney(5), '$0.05')
})
