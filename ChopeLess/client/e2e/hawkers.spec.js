// Hawker sign-up, admin approval, menu management and the public stall page. Owner: M6
import { test, expect } from '@playwright/test'
import { signUp, logIn } from './helpers.js'

const CENTRE = 'Albert Centre Market & Food Centre'

// Fill in the hawker sign-up form as a brand-new visitor, and apply.
// insideCentre: the hawker centre the stall is in ('' = a restaurant on its own)
async function applyAsNewHawker(page, stallName, insideCentre = '') {
  await page.goto('/hawker/signup')
  await page.getByLabel('Email').fill(`hawker-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`)
  await page.getByLabel('Password').fill('test1234')
  await page.getByLabel('Your name').fill('Test Hawker')
  await page.getByLabel('Stall name').fill(stallName)
  await page.getByLabel('Cuisine').fill('Chinese')
  await page.getByLabel('Address').fill('1 Test Street')
  if (insideCentre) await page.getByLabel('Is your stall inside a hawker centre or food court?').selectOption({ label: insideCentre })
  await page.getByTestId('map').click() // pick the stall's location
  await page.getByLabel('halal').check()
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByTestId('application-status')).toContainText('Application sent')
}

// [SILVER] this test also checks the inside-a-centre parts of sign-up and approval
test('hawker signs up inside a hawker centre, admin approves, hawker builds the menu, and it shows online', async ({ page, browser }) => {
  const stallName = 'Test Stall ' + Date.now()
  await applyAsNewHawker(page, stallName, CENTRE)

  // The admin approves the application
  const admin = await (await browser.newContext()).newPage()
  await logIn(admin, 'admin@chopeless.test')
  await admin.goto('/admin')
  const card = admin.getByTestId('application').filter({ hasText: stallName })
  await card.getByRole('button', { name: 'Approve' }).click()
  await expect(card).toHaveCount(0)

  // The hawker gets a notice straight away (no reload) and opens their menu page
  const notice = page.getByTestId('application-notice')
  await expect(notice).toContainText('approved')
  await notice.getByRole('button', { name: 'Set up my menu' }).click()
  await expect(page).toHaveURL(/\/hawker\/menu$/)
  // [M3] the link is in both the ☰ menu and the laptop dropdown now, so check the first one
  await expect(page.locator('nav a[href="/hawker/menu"]').first()).toBeAttached() // hawker links unlocked

  // Type in a dish, then change its price
  await page.locator('#dish-name').fill('Laksa')
  await page.locator('#dish-price').fill('5.50')
  await page.getByRole('button', { name: 'Add dish' }).click()
  const laksa = page.getByTestId('menu-dish').first() // the first dish added
  await expect(page.getByTestId('menu-dish')).toHaveCount(1)
  await laksa.getByLabel('Price').fill('6')
  await laksa.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved')).toBeVisible()

  // Add a second dish
  await page.locator('#dish-name').fill('Mee goreng')
  await page.locator('#dish-price').fill('4.50')
  await page.getByRole('button', { name: 'Add dish' }).click()
  await expect(page.getByTestId('menu-dish')).toHaveCount(2)

  // Mark the laksa sold out
  await laksa.getByRole('button', { name: 'Sold out' }).click()
  await expect(laksa).toContainText('Sold out')

  // The public stall page shows the menu, with the new price and the sold-out dish
  await page.getByTestId('public-page-link').click()
  await expect(page.getByRole('heading', { name: stallName })).toBeVisible()
  await expect(page.getByText(`Inside ${CENTRE}`)).toBeVisible() // it's a stall inside the hawker centre
  const stallUrl = page.url()
  await expect(page.getByTestId('public-dish')).toHaveCount(2)
  await expect(page.getByTestId('public-dish').filter({ hasText: 'Laksa' })).toContainText('Sold out')

  // Anyone can see the page without logging in, and a diner can pre-order from it
  const diner = await (await browser.newContext()).newPage()
  await diner.goto(stallUrl)
  await expect(diner.getByTestId('public-dish')).toHaveCount(2)
  await signUp(diner, 'stallfan')
  await diner.goto(stallUrl)
  await diner.getByRole('button', { name: 'Pre-order for pickup' }).click()
  await expect(diner).toHaveURL(/\/orders\/\w+$/)
  await expect(diner.getByRole('button', { name: 'Add Laksa' })).toHaveCount(0) // sold out
  await diner.getByRole('button', { name: 'Add Mee goreng' }).click()
  await expect(diner.getByTestId('order-total')).toHaveText('$4.50')

  // The new stall is listed inside the hawker centre on the Pre-order page
  await diner.goto('/orders')
  await diner.getByTestId('place-card').filter({ hasText: CENTRE }).getByRole('button', { name: 'See stalls' }).click()
  await expect(diner.getByTestId('stall-card').filter({ hasText: stallName })).toBeVisible()
})

test('a rejected application shows the reason', async ({ page, browser }) => {
  const stallName = 'Rejected Stall ' + Date.now()
  await applyAsNewHawker(page, stallName)

  const admin = await (await browser.newContext()).newPage()
  await logIn(admin, 'admin@chopeless.test')
  await admin.goto('/admin')
  const card = admin.getByTestId('application').filter({ hasText: stallName })
  await card.getByLabel('Reason').fill('Please add your full address')
  await card.getByRole('button', { name: 'Reject' }).click()
  await expect(card).toHaveCount(0)

  // The applicant gets a notice straight away, and it stays on every page
  const notice = page.getByTestId('application-notice')
  await expect(notice).toContainText('not approved')
  await expect(notice).toContainText('Please add your full address')
  await page.goto('/queueless')
  await expect(notice).toContainText('Please add your full address')
  await notice.getByRole('link', { name: 'Fix and apply again' }).click()
  await expect(page).toHaveURL(/\/hawker\/signup$/)
  await expect(page.getByTestId('application-status')).toContainText('Please add your full address')
})

test('diners cannot open the menu page', async ({ page }) => {
  await signUp(page, 'notahawker')
  await page.goto('/hawker/menu')
  await expect(page).toHaveURL(/\/$/)
})
