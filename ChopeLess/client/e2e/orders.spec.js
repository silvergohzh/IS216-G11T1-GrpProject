// Orders + Payments + Platform. Owner: M6
import { test, expect } from '@playwright/test'
import { createHmac } from 'crypto'
import { signUp, logIn } from './helpers.js'

const STALL = 'Albert Centre Market & Food Centre' // the seeded hawker@chopeless.test runs this stall
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
    data: { object: { metadata: { orderId } } }
  })
  const time = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', secret).update(`${time}.${body}`).digest('hex')
  return { data: body, headers: { 'content-type': 'application/json', 'stripe-signature': `t=${time},v1=${signature}` } }
}

// Start an order at the test stall and return its id (taken from the page address)
async function startOrder(page) {
  await page.goto('/orders')
  await page.getByTestId('stall-card').filter({ hasText: STALL }).getByRole('button', { name: 'Order here' }).click()
  await expect(page).toHaveURL(/\/orders\/\w+$/)
  return page.url().split('/').pop()
}

test('full journey: pay, hawker readies with a photo, diner collects with a photo, both see history', async ({ page, browser, request }) => {
  // A diner orders one chicken rice ($4.50)
  await signUp(page, 'orders')
  const orderId = await startOrder(page)
  const code = '#' + orderId.slice(-4).toUpperCase()
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
  const card = hawker.getByTestId('board-order').filter({ hasText: code })
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
  await expect(page.getByTestId('past-order').filter({ hasText: code })).toContainText('Collected')
  await hawker.getByRole('button', { name: /History/ }).click()
  await expect(hawker.getByTestId('history-order').filter({ hasText: code })).toBeVisible()
})

test('a fake payment message is rejected', async ({ page, request }) => {
  await signUp(page, 'fakepay')
  const orderId = await startOrder(page)
  await page.getByRole('button', { name: 'Add Laksa' }).click()

  // Signed with the wrong secret, so it is not really from Stripe
  const res = await request.post(WEBHOOK_URL, stripeMessage(orderId, 'whsec_wrong'))
  expect(res.status()).toBe(400)
  await expect(page.getByTestId('order-status')).toHaveText('In cart')
})

test('group order: a friend joins with the code and the bill splits', async ({ page, browser }) => {
  // Alice starts the order and adds chicken rice ($4.50)
  await signUp(page, 'alice')
  const orderId = await startOrder(page)
  await page.getByRole('button', { name: 'Add Chicken rice' }).click()
  const joinCode = (await page.getByTestId('join-code').textContent()).trim()

  // Starting an order at the same stall again reopens the same cart (no duplicates)
  expect(await startOrder(page)).toBe(orderId)

  // Ben types the code on the Pre-order page and adds laksa ($5.00)
  const ben = await (await browser.newContext()).newPage()
  await signUp(ben, 'ben')
  await ben.goto('/orders')
  await ben.getByTestId('join-input').fill(joinCode)
  await ben.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(ben).toHaveURL(new RegExp(orderId))
  await ben.getByRole('button', { name: 'Add Laksa' }).click()

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

test('demo accounts log in with one tap', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /Albert Centre Hawker/ }).click()
  await expect(page).toHaveURL(/\/sessions$/)
  await page.goto('/hawker')
  await expect(page.getByRole('heading', { name: 'Order board' })).toBeVisible()
})

test('diners cannot open the hawker board or the admin page', async ({ page }) => {
  await signUp(page, 'nosy')
  await page.goto('/hawker')
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/$/)
})
