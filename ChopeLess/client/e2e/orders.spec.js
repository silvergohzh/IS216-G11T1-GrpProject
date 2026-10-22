// Orders + Payments + Platform. Owner: M6
import { test, expect } from '@playwright/test'
import { createHmac } from 'crypto'
import { signUp, logIn } from './helpers.js'

const STALL = 'Albert Centre Market & Food Centre' // the seeded hawker runs this stall
const WEBHOOK_URL = 'http://localhost:3001/api/payments/webhook'
const WEBHOOK_SECRET = 'whsec_test_chopeless' // same made-up secret as in playwright.config.js

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

// Start a new order at the test stall and return its id (taken from the page address)
async function startOrder(page) {
  await page.goto('/orders')
  await page.getByLabel('Stall').selectOption({ label: STALL })
  await page.getByRole('button', { name: 'Start order' }).click()
  await expect(page).toHaveURL(/\/orders\/\w+$/)
  return page.url().split('/').pop()
}

test('pre-order, pay, and the order shows as paid on the hawker board', async ({ page, browser, request }) => {
  // A diner orders one chicken rice ($4.50)
  await signUp(page, 'orders')
  const orderId = await startOrder(page)
  await page.getByRole('button', { name: 'Add Chicken rice' }).click()
  await expect(page.getByTestId('cart-item')).toHaveCount(1)
  await expect(page.getByTestId('order-total')).toHaveText('$4.50')

  // Stripe tells our server the payment worked (signed webhook)
  const res = await request.post(WEBHOOK_URL, stripeMessage(orderId))
  expect(res.ok()).toBeTruthy()
  await expect(page.getByTestId('order-status')).toHaveText('Paid') // updates live, no refresh

  // The hawker sees the paid order on their board and starts preparing it
  const hawker = await (await browser.newContext()).newPage()
  await logIn(hawker, 'hawker@chopeless.test')
  await hawker.goto('/hawker')
  const code = '#' + orderId.slice(-4).toUpperCase()
  const card = hawker.getByTestId('board-order').filter({ hasText: code })
  await expect(card).toContainText('Paid')
  await card.getByRole('button', { name: 'Start preparing' }).click()
  await expect(card).toContainText('Preparing')

  // The diner's page updates too
  await expect(page.getByTestId('order-status')).toHaveText('Preparing')
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

test('group cart: a friend joins with the link and the bill splits', async ({ page, browser }) => {
  // Alice starts the order and adds chicken rice ($4.50)
  await signUp(page, 'alice')
  const orderId = await startOrder(page)
  await page.getByRole('button', { name: 'Add Chicken rice' }).click()

  // Ben opens the shared link and adds laksa ($5.00)
  const ben = await (await browser.newContext()).newPage()
  await signUp(ben, 'ben')
  await ben.goto(`/orders/${orderId}`)
  await ben.getByRole('button', { name: 'Add Laksa' }).click()

  // Alice sees Ben's item appear live, and the total is $9.50
  await expect(page.getByTestId('cart-item')).toHaveCount(2)
  await expect(page.getByTestId('order-total')).toHaveText('$9.50')

  // By item: Alice $4.50, Ben $5.00.  Equally: $4.75 each.
  await expect(page.getByTestId('share')).toHaveText([/\$4\.50/, /\$5\.00/])
  await page.getByRole('button', { name: 'Equally' }).click()
  await expect(page.getByTestId('share')).toHaveText([/\$4\.75/, /\$4\.75/])
})

test('diners cannot open the hawker board or the admin page', async ({ page }) => {
  await signUp(page, 'nosy')
  await page.goto('/hawker')
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/$/)
})
