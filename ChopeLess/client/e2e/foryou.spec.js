// Owner: M3. "For You" on the Home page: browse, save ♥, Saved tab, "Not for me" ✕,
// personal picks ("Like <place>: ..."), Refresh, and opening a place.
import { test, expect } from '@playwright/test'
import { signUp } from './helpers.js'

// The For You row, and the cards in it (each card has a link "Open <place name>")
const row = page => page.getByTestId('for-you')
const cards = page => row(page).getByRole('link', { name: /^Open / })
const firstCardName = async page => (await cards(page).first().getAttribute('aria-label')).replace(/^Open /, '')

test('guests can browse For You, and ♥ asks them to log in', async ({ page }) => {
  await page.goto('/')
  await expect(row(page).getByRole('heading', { name: /Discover/ })).toBeVisible()
  await expect(cards(page).first()).toBeVisible()
  // Guests have no Saved tab and no ✕ button
  await expect(row(page).getByRole('button', { name: /Saved/ })).toHaveCount(0)
  await expect(row(page).getByRole('button', { name: 'Not for me' })).toHaveCount(0)

  await row(page).getByTestId('save-place').first().click()
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)$/)
})

test('save ♥: the place goes to the Saved tab, picks become personal, and unsave empties it', async ({ page }) => {
  await signUp(page, 'foryou-save')
  await page.goto('/')
  await expect(cards(page).first()).toBeVisible()
  const name = await firstCardName(page)

  // Save the first card
  await row(page).getByTestId('save-place').first().click()
  await expect(row(page).getByRole('button', { name: 'Saved (1)', exact: false })).toBeVisible()

  // The feed now has picks "Like <saved place>: ..." and the title changes to For you
  await expect(row(page).getByRole('heading', { name: /For you/ })).toBeVisible()
  await expect(row(page).getByText(`Like ${name}:`).first()).toBeVisible()

  // Saved tab shows it, and it's still there on a fresh page (stored in Firestore, not the browser).
  // We check on a NEW tab and keep this one open: reloading this tab straight away could cancel
  // the save while it is still on its way to the database (that made this test flaky on CI).
  const fresh = await page.context().newPage()      // same browser = still logged in
  await expect(async () => {
    await fresh.goto('/')
    await expect(row(fresh).getByRole('button', { name: /Saved \(1\)/ })).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 20000 })
  await row(fresh).getByRole('button', { name: /Saved \(1\)/ }).click()
  await expect(cards(fresh)).toHaveCount(1)
  await expect(cards(fresh).first()).toHaveAccessibleName(`Open ${name}`)

  // Unsave it: the Saved tab is empty again
  await row(fresh).getByRole('button', { name: 'Unsave' }).click()
  await expect(row(fresh).getByText('Nothing saved yet.')).toBeVisible()
  await expect(row(fresh).getByRole('button', { name: /Saved \(0\)/ })).toBeVisible()
})

test('✕ Not for me hides a place, and it stays hidden after a refresh', async ({ page }) => {
  await signUp(page, 'foryou-hide')
  await page.goto('/')
  await expect(cards(page).first()).toBeVisible()
  const name = await firstCardName(page)

  await row(page).getByRole('button', { name: 'Not for me' }).first().click()
  await expect(row(page).getByRole('link', { name: `Open ${name}` })).toHaveCount(0)

  await page.reload()
  await expect(cards(page).first()).toBeVisible()
  await expect(row(page).getByRole('link', { name: `Open ${name}` })).toHaveCount(0)
})

test('↻ Refresh shuffles the picks, and tapping a card opens that place', async ({ page }) => {
  await page.goto('/')
  await expect(cards(page).first()).toBeVisible()
  const names = async () => (await cards(page).evaluateAll(els => els.map(e => e.getAttribute('aria-label'))))
  const before = await names()

  await row(page).getByTestId('for-you-refresh').click()
  await expect.poll(names).not.toEqual(before)

  const name = await firstCardName(page)
  await cards(page).first().click()
  await expect(page).toHaveURL(/\/places\/[^/]+$/)
  await expect(page.getByText(name).first()).toBeVisible()
})