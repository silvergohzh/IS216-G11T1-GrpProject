// Orders + Payments + Platform. Owner: M6
import { test, expect } from '@playwright/test'
import { createHmac } from 'crypto'
import { signUp, logIn } from './helpers.js'

const CENTRE = 'Albert Centre Market & Food Centre' // a hawker centre with stalls inside
const STALL = 'Ah Seng Chicken Rice'                 // a stall inside it, run by hawker@chopeless.test
const WEBHOOK_URL = 'http://localhost:3001/api/payments/webhook'
const WEBHOOK_SECRET = 'whsec_test_chopeless' // same made-up secret as in playwright.config.js

// A tiny 2x2 PNG, used as the proof photo
const PHOTO = {
  name: 'proof.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64')
}

// Pretend to be Stripe: send the "payment worked" message for an order, signed with the shared secret.
// Stripe's signature is: t=<time>,v1=<HMAC-SHA256 of "<time>.<message>" using the secret>
function stripeMessage(orderId, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify({
    id: 'evt_test',
    type: 'checkout.session.completed',
    data: { object: { metadata: { orderId }, payment_intent: '' } }
  })
  const time = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', secret).update(`${time}.${body}`).digest('hex')
  return { data: body, headers: { 'content-type': 'application/json', 'stripe-signature': `t=${time},v1=${signature}` } }
}

// Start an order at the test stall (inside the hawker centre) and return its id
async function startOrder(page) {
  await page.goto('/orders')
  await page.getByTestId('place-card').filter({ hasText: CENTRE }).getByRole('button', { name: 'See stalls' }).click()
  await page.getByTestId('stall-card').filter({ hasText: STALL }).getByRole('button', { name: 'Order here' }).click()
  await expect(page).toHaveURL(/\/orders\/\w+$/)
  return page.url().split('/').pop()
}

const codeOf = orderId => '#' + orderId.slice(-4).toUpperCase()

// [SILVER] START: Hawker centres, food courts, stalls & place tags (built by Myat, see HANDOVER.md)
test('a hawker centre only shows the stalls inside it, with tags', async ({ page }) => {
  await signUp(page, 'browser')
  await page.goto('/orders')
  await expect(page.getByTestId('place-card').filter({ hasText: CENTRE })).toContainText('Hawker centre')
  await expect(page.getByTestId('place-card').filter({ hasText: 'Bras Basah' })).toContainText('Food court')
  await expect(page.getByTestId('place-card').filter({ hasText: 'Ice Lab' })).toContainText('Restaurant')

  await page.getByTestId('place-card').filter({ hasText: CENTRE }).getByRole('button', { name: 'See stalls' }).click()
  // Its 3 seeded stalls (hawkers who sign up inside it can add more)
  await expect(page.getByTestId('stall-card').filter({ hasText: STALL })).toBeVisible()
  await expect(page.getByTestId('stall-card').filter({ hasText: 'Albert Laksa' })).toBeVisible()
  await expect(page.getByTestId('stall-card').filter({ hasText: 'Makcik Nasi Padang' })).toBeVisible()
  await expect(page.getByTestId('place-card')).toHaveCount(0) // other places are hidden while inside the centre
})
// [SILVER] END

test('full journey: pay, hawker readies with a photo, diner collects with a photo, both see history', async ({ page, browser, request }) => {
  // A diner orders one chicken rice ($4.50)
  await signUp(page, 'orders')
  const orderId = await startOrder(page)
  await page.getByRole('button', { name: 'Add Chicken rice' }).click()
  await expect(page.getByTestId('order-total')).toHaveText('$4.50')

  // Stripe tells our server the payment worked (signed webhook)
  const res = await request.post(WEBHOOK_URL, stripeMessage(orderId))
  expect(res.ok()).toBeTruthy()
  await expect(page.getByTestId('order-status')).toHaveText('Paid') // updates live, no refresh

  // The hawker starts preparing, then marks it ready with a photo
  const hawker = await (await browser.newContext()).newPage()
  await logIn(hawker, 'hawker@chopeless.test')
  await hawker.goto('/hawker')
  const card = hawker.getByTestId('board-order').filter({ hasText: codeOf(orderId) })
  await card.getByRole('button', { name: 'Start preparing' }).click()
  await expect(card).toContainText('Preparing')
  await card.getByTestId('proof-input').setInputFiles(PHOTO)
  await card.getByRole('button', { name: 'Mark ready' }).click()
  await expect(card).toContainText('left to collect') // the 15-minute timer started

  // The diner gets a pop-up, sees the timer, and collects it with a photo
  await expect(page.getByTestId('toast')).toContainText('is ready')
  await expect(page.getByTestId('order-status')).toHaveText('Ready for pickup')
  await expect(page.getByTestId('pickup-timer')).toContainText('left to collect')
  await page.getByTestId('proof-input').setInputFiles(PHOTO)
  await page.getByRole('button', { name: "I've collected it" }).click()
  await expect(page.getByTestId('order-status')).toHaveText('Collected')
  await expect(page.getByTestId('proof-photo')).toHaveCount(2) // hawker's photo + diner's photo

  // Both histories show it
  await page.goto('/orders')
  await expect(page.getByTestId('past-order').filter({ hasText: codeOf(orderId) })).toContainText('Collected')
  await hawker.getByRole('button', { name: /History/ }).click()
  await expect(hawker.getByTestId('history-order').filter({ hasText: codeOf(orderId) })).toBeVisible()
})

test('portions left: diners cannot order more than the hawker has, the menu updates live, and paying uses them up', async ({ page, browser, request }) => {
  const dishName = 'Naruto ramen ' + Date.now() // unique, because the phone and desktop runs share the stall

  // The hawker adds a dish with only 1 portion left
  const hawker = await (await browser.newContext()).newPage()
  await logIn(hawker, 'hawker@chopeless.test')
  await hawker.goto('/hawker/menu')
  await hawker.locator('#dish-name').fill(dishName)
  await hawker.locator('#dish-price').fill('8')
  await hawker.locator('#dish-stock').fill('1')
  await hawker.getByRole('button', { name: 'Add dish' }).click()
  const row = hawker.locator(`[data-testid="menu-dish"][data-name="${dishName}"]`)
  await expect(row.getByLabel('Portions left')).toHaveValue('1')

  // A diner can add it once, then the Add and + buttons stop working
  await signUp(page, 'portions')
  await startOrder(page)
  await page.getByRole('button', { name: `Add ${dishName}` }).click()
  await expect(page.getByTestId('order-total')).toHaveText('$8.00')
  await expect(page.getByRole('button', { name: `Add ${dishName}` })).toBeDisabled()
  const line = page.getByTestId('cart-item').filter({ hasText: dishName })
  await expect(line.getByRole('button', { name: 'One more' })).toBeDisabled()

  // The hawker cooks more. The diner's menu updates live (no refresh), so they can add another
  await row.getByLabel('Portions left').fill('3')
  await row.getByRole('button', { name: 'Save' }).click()
  await expect(line.getByRole('button', { name: 'One more' })).toBeEnabled()
  await line.getByRole('button', { name: 'One more' }).click()
  await expect(page.getByTestId('order-total')).toHaveText('$16.00')

  // Paying takes the 2 portions off: 3 - 2 = 1 left
  const orderId = page.url().split('/').pop()
  const res = await request.post(WEBHOOK_URL, stripeMessage(orderId))
  expect(res.ok()).toBeTruthy()
  await expect(page.getByTestId('order-status')).toHaveText('Paid')
  await expect(row.getByLabel('Portions left')).toHaveValue('1')
})

test('a fake payment message is rejected', async ({ page, request }) => {
  await signUp(page, 'fakepay')
  const orderId = await startOrder(page)
  await page.getByRole('button', { name: 'Add Roast pork rice' }).click()

  // Signed with the wrong secret, so it is not really from Stripe
  const res = await request.post(WEBHOOK_URL, stripeMessage(orderId, 'whsec_wrong'))
  expect(res.status()).toBe(400)
  await expect(page.getByTestId('order-status')).toHaveText('In cart')
})

test('payments: diner receipt, hawker earnings and refund, admin delete', async ({ page, browser }) => {
  // A diner pays (demo mode: no Stripe keys in the test server)
  await signUp(page, 'payer')
  const orderId = await startOrder(page)
  await page.getByRole('button', { name: 'Add Roast pork rice' }).click()
  await page.getByRole('button', { name: 'Pay $5.00' }).click()
  await expect(page.getByTestId('order-status')).toHaveText('Paid')

  // READ: the diner sees the receipt
  await page.goto('/payments')
  const receipt = page.getByTestId('payment-row').filter({ hasText: codeOf(orderId) })
  await expect(receipt).toContainText('$5.00')
  await expect(receipt.getByTestId('payment-status')).toHaveText('Paid')

  // UPDATE: the stall's hawker sees it in their earnings and refunds it
  const hawker = await (await browser.newContext()).newPage()
  await logIn(hawker, 'hawker@chopeless.test')
  await hawker.goto('/payments')
  await expect(hawker.getByRole('heading', { name: 'Earnings' })).toBeVisible()
  const row = hawker.getByTestId('payment-row').filter({ hasText: codeOf(orderId) })
  await row.getByLabel('Refund reason').fill('Sold out of roast pork')
  await row.getByRole('button', { name: 'Refund' }).click()
  await expect(row.getByTestId('payment-status')).toHaveText('Refunded')

  // The diner sees the refund live, and the unpaid-for order is cancelled
  await expect(receipt.getByTestId('payment-status')).toHaveText('Refunded')
  await expect(receipt).toContainText('Sold out of roast pork')

  // DELETE: an admin removes the record
  const admin = await (await browser.newContext()).newPage()
  await logIn(admin, 'admin@chopeless.test')
  await admin.goto('/payments')
  await expect(admin.getByRole('heading', { name: 'All payments' })).toBeVisible()
  admin.on('dialog', dialog => dialog.accept()) // "Delete this payment record?"
  const adminRow = admin.getByTestId('payment-row').filter({ hasText: codeOf(orderId) })
  await adminRow.getByRole('button', { name: 'Delete record' }).click()
  await expect(adminRow).toHaveCount(0)
})

// [NAWAZ] START: Fastpass & Makan Points in pre-orders (built by Myat, see HANDOVER.md)
test('Fastpass: the group leader spends points and the order jumps the queue', async ({ page, browser }) => {
  // Someone else pays first, so there is a queue at the stall
  const early = await (await browser.newContext()).newPage()
  await signUp(early, 'early')
  await startOrder(early)
  await early.getByRole('button', { name: 'Add Steamed egg' }).click()
  await early.getByRole('button', { name: 'Pay $1.50' }).click()
  await expect(early.getByTestId('order-status')).toHaveText('Paid')

  // Alice (seeded with Makan Points) orders later, with a friend, and buys a Fastpass
  await logIn(page, 'alice@chopeless.test')
  const orderId = await startOrder(page)
  await page.getByRole('button', { name: 'Add Chicken rice' }).click()
  const joinCode = (await page.getByTestId('join-code').textContent()).trim()
  await page.getByTestId('fastpass-offer').getByRole('button', { name: 'Use 150 points' }).click()
  await expect(page.getByTestId('fastpass-on')).toContainText('Alice Tan')

  // Her friend in the same group order sees the Fastpass too
  const friend = await (await browser.newContext()).newPage()
  await signUp(friend, 'fastfriend')
  await friend.goto(`/orders?join=${joinCode}`)
  await expect(friend.getByTestId('fastpass-on')).toBeVisible()

  // Alice pays: she is #1 in the queue even though she paid after the other diner
  await page.getByRole('button', { name: 'Pay $4.50' }).click()
  await expect(page.getByTestId('order-status')).toHaveText('Paid')
  await expect(page.getByTestId('queue-position')).toContainText("You're #1")

  // On the hawker's board, the Fastpass order is first, with a badge
  const hawker = await (await browser.newContext()).newPage()
  await logIn(hawker, 'hawker@chopeless.test')
  await hawker.goto('/hawker')
  const first = hawker.getByTestId('board-order').first()
  await expect(first).toContainText(codeOf(orderId))
  await expect(first.getByTestId('fastpass-badge')).toBeVisible()

  // The hawker starts it, so it leaves the waiting queue
  await first.getByRole('button', { name: 'Start preparing' }).click()
  await expect(page.getByTestId('order-status')).toHaveText('Preparing')
})
// [NAWAZ] END

test('Makan Session: pick a place together, then pre-order as a group', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage()
  const guest = await (await browser.newContext()).newPage()

  // Make the group: host creates a session, guest joins
  await signUp(host, 'grouphost')
  await host.getByTestId('create-session').click()
  const code = (await host.getByTestId('session-code').textContent()).trim()
  await signUp(guest, 'groupguest')
  await guest.getByTestId('join-code').fill(code)
  await guest.getByRole('button', { name: 'Join' }).click()
  await expect(host.getByTestId('member-list').locator('li')).toHaveCount(2)

  // Confirm the food spot: both vote yes on the first card
  await host.getByRole('button', { name: 'Start voting' }).click()
  await expect(host).toHaveURL(/\/vote$/)
  await expect(guest).toHaveURL(/\/vote$/)
  await host.getByTestId('vote-yes').click()
  await guest.keyboard.press('ArrowRight')
  // The winner page shows a capsule first: tap it to reveal the winner (it may also open by itself)
  await host.getByRole('button', { name: 'Open the capsule' }).click({ timeout: 5000 }).catch(() => {})
  await expect(host.getByTestId('winner-name')).toBeVisible()

  // Then order: "Pre-order as a group" shows only the place the group picked
  await host.getByTestId('group-preorder').click()
  await expect(host.getByTestId('session-banner')).toContainText('2 of you')
  await host.getByRole('button', { name: 'Order here' }).first().click()
  await expect(host).toHaveURL(/\/orders\/\w+$/)

  // The guest is already in the order (no join code needed)
  await guest.goto('/orders')
  await expect(guest.getByTestId('active-order')).toHaveCount(1)
})

test('group order: a friend joins with the code and the bill splits', async ({ page, browser }) => {
  // Alice starts the order and adds chicken rice ($4.50)
  await signUp(page, 'alice')
  const orderId = await startOrder(page)
  await page.getByRole('button', { name: 'Add Chicken rice' }).click()
  const joinCode = (await page.getByTestId('join-code').textContent()).trim()

  // Starting an order at the same stall again reopens the same cart (no duplicates)
  expect(await startOrder(page)).toBe(orderId)

  // Ben types the code on the Pre-order page and adds roast pork rice ($5.00)
  const ben = await (await browser.newContext()).newPage()
  await signUp(ben, 'ben')
  await ben.goto('/orders')
  await ben.getByTestId('join-input').fill(joinCode)
  await ben.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(ben).toHaveURL(new RegExp(orderId))
  await ben.getByRole('button', { name: 'Add Roast pork rice' }).click()

  // Alice sees Ben's item appear live, and the total is $9.50
  await expect(page.getByTestId('cart-item')).toHaveCount(2)
  await expect(page.getByTestId('order-total')).toHaveText('$9.50')

  // By item: Alice $4.50, Ben $5.00.  Equally: $4.75 each.
  await expect(page.getByTestId('share')).toHaveText([/\$4\.50/, /\$5\.00/])
  await page.getByRole('button', { name: 'Equally' }).click()
  await expect(page.getByTestId('share')).toHaveText([/\$4\.75/, /\$4\.75/])
})

test('the share link joins the group order', async ({ page, browser }) => {
  await signUp(page, 'host')
  const orderId = await startOrder(page)
  const joinCode = (await page.getByTestId('join-code').textContent()).trim()

  const friend = await (await browser.newContext()).newPage()
  await signUp(friend, 'friend')
  await friend.goto(`/orders?join=${joinCode}`)
  await expect(friend).toHaveURL(new RegExp(orderId))
})

test('diners cannot open the hawker board or the admin page', async ({ page }) => {
  await signUp(page, 'nosy')
  await page.goto('/hawker')
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/$/)
})
