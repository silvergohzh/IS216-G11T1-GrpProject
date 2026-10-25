// Hawker sign-up, admin approval, menu management and the public stall page. Owner: M6
import { test, expect } from '@playwright/test'
import { signUp, logIn } from './helpers.js'

// A tiny 2x2 PNG, used as the "menu photo" (the test server has no OpenAI key, so the AI returns sample dishes)
const PHOTO = {
  name: 'menu.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64')
}

// Fill in the hawker sign-up form as a brand-new visitor, and apply
async function applyAsNewHawker(page, stallName) {
  await page.goto('/hawker/signup')
  await page.getByLabel('Email').fill(`hawker-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`)
  await page.getByLabel('Password').fill('test1234')
  await page.getByLabel('Your name').fill('Test Hawker')
  await page.getByLabel('Stall name').fill(stallName)
  await page.getByLabel('Cuisine').fill('Chinese')
  await page.getByLabel('Address').fill('1 Test Street')
  await page.getByTestId('map').click() // pick the stall's location
  await page.getByLabel('halal').check()
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByTestId('application-status')).toContainText('Application sent')
}

test('hawker signs up, admin approves, hawker builds the menu, and it shows online', async ({ page, browser }) => {
  const stallName = 'Test Stall ' + Date.now()
  await applyAsNewHawker(page, stallName)

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
  await expect(page.locator('nav a[href="/hawker/menu"]')).toBeAttached() // hawker links unlocked (inside ☰ on phones)

  // Type in a dish, then change its price
  await page.locator('#dish-name').fill('Laksa')
  await page.locator('#dish-price').fill('5.50')
  await page.getByRole('button', { name: 'Add dish' }).click()
  const laksa = page.getByTestId('menu-dish').first() // the first dish added
  await expect(page.getByTestId('menu-dish')).toHaveCount(1)
  await laksa.getByLabel('Price').fill('6')
  await laksa.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved')).toBeVisible()

  // Scan a menu photo: the AI's dishes appear as a draft, then get added
  await page.getByTestId('proof-input').setInputFiles(PHOTO)
  await page.getByRole('button', { name: 'Read my menu' }).click()
  await expect(page.getByTestId('draft-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Add 3 dishes to my menu' }).click()
  await expect(page.getByTestId('menu-dish')).toHaveCount(4)

  // Mark the laksa sold out
  await laksa.getByRole('button', { name: 'Sold out' }).click()
  await expect(laksa).toContainText('Sold out')

  // The public stall page shows the menu, with the new price and the sold-out dish
  await page.getByTestId('public-page-link').click()
  await expect(page.getByRole('heading', { name: stallName })).toBeVisible()
  const stallUrl = page.url()
  await expect(page.getByTestId('public-dish')).toHaveCount(4)
  await expect(page.getByTestId('public-dish').filter({ hasText: 'Laksa' })).toContainText('Sold out')

  // Anyone can see the page without logging in, and a diner can pre-order from it
  const diner = await (await browser.newContext()).newPage()
  await diner.goto(stallUrl)
  await expect(diner.getByTestId('public-dish')).toHaveCount(4)
  await signUp(diner, 'stallfan')
  await diner.goto(stallUrl)
  await diner.getByRole('button', { name: 'Pre-order for pickup' }).click()
  await expect(diner).toHaveURL(/\/orders\/\w+$/)
  await expect(diner.getByRole('button', { name: 'Add Laksa' })).toHaveCount(0) // sold out
  await diner.getByRole('button', { name: 'Add Sample dish: Chicken rice' }).click()
  await expect(diner.getByTestId('order-total')).toHaveText('$4.50')
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
