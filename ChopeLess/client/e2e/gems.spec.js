// E2E tests: Hidden Gems. Owner: M5
// 1. Add a gem (a photo and a map location are required), edit it, then delete it
// 2. Upvote and take the vote back, post two reviews, and watch the average rating follow

import { test, expect } from '@playwright/test'
import { signUp } from './helpers.js'

// A 1x1 pixel PNG, so the tests need no image file. The page shrinks it to a small JPEG like any other photo.
const PHOTO = {
  name: 'gem.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  )
}

// Fills the text boxes. Prices, wait time and Dine-in/Takeaway already have sensible defaults.
async function fillDetails(page, name) {
  await page.getByLabel('Stall or shop').fill(name)
  await page.getByLabel('Must try').fill('Mee rebus')
  await page.getByLabel('Cuisine').fill('Malay')
  await page.getByLabel('Address').fill('1 Test Street')
}

const attachPhoto = async page => {
  await page.getByLabel('Photo of the place').setInputFiles(PHOTO)
  await expect(page.getByAltText('Preview of the place')).toBeVisible()
}

const pickLocation = async page => {
  await page.getByTestId('map').click()   // a gem needs a location: click the map to pick one
  await expect(page.getByText(/^Picked:/)).toBeVisible()
}

const submit = page => page.getByRole('button', { name: 'Add gem', exact: true }).click()

// The whole add-a-gem flow. Returns the gem's card on the board.
async function addGem(page, name) {
  await page.goto('/gems')
  await fillDetails(page, name)
  await attachPhoto(page)
  await pickLocation(page)
  await submit(page)
  const card = page.getByTestId('gem-row').filter({ hasText: name })
  await expect(card).toBeVisible()
  return card
}

test('a gem needs a photo and a map location, and can then be added, edited and deleted', async ({ page }) => {
  await signUp(page, 'gems')
  await page.goto('/gems')
  const name = 'Test Stall ' + Date.now()

  // No photo yet: refused
  await fillDetails(page, name)
  await submit(page)
  await expect(page.getByText('Add a photo of the place', { exact: true })).toBeVisible()

  // Photo but no location: refused
  await attachPhoto(page)
  await submit(page)
  await expect(page.getByText('Click the map to pick the gem location')).toBeVisible()

  // Photo and location: it appears on the board and the form resets
  await pickLocation(page)
  await submit(page)
  const row = page.getByTestId('gem-row').filter({ hasText: name })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Malay')
  await expect(row).toContainText('No ratings yet')
  await expect(row).toContainText('▲ 0')
  await expect(page.getByRole('heading', { name: 'Add a gem' })).toBeVisible()

  // Edit
  await row.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { name: 'Edit gem' })).toBeVisible()
  await page.getByLabel('Must try').fill('Lontong')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(row).toContainText('Lontong')

  // Delete
  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(row).toHaveCount(0)
})

test('you can upvote and take your vote back, and reviews update the average rating', async ({ page }) => {
  await signUp(page, 'gems-vote')
  const card = await addGem(page, 'Review Stall ' + Date.now())

  // Upvote, then take it back
  const vote = card.getByRole('button', { name: '▲' })
  await vote.click()
  await expect(card).toContainText('▲ 1')
  await expect(vote).toHaveAttribute('aria-pressed', 'true')
  await vote.click()
  await expect(card).toContainText('▲ 0')
  await expect(vote).toHaveAttribute('aria-pressed', 'false')

  // Two reviews from the same user (there is no limit), and the average follows
  await card.getByRole('button', { name: 'Reviews' }).click()

  await card.getByLabel('Rating').selectOption('4')
  await card.getByPlaceholder(/Share what you tried/).fill('Great mee rebus')
  await card.getByRole('button', { name: 'Post review' }).click()
  await expect(card).toContainText('Great mee rebus')
  await expect(card).toContainText('4.0 / 5 (1 review)')

  await card.getByLabel('Rating').selectOption('2')
  await card.getByPlaceholder(/Share what you tried/).fill('A bit salty')
  await card.getByRole('button', { name: 'Post review' }).click()
  await expect(card).toContainText('A bit salty')
  await expect(card).toContainText('3.0 / 5 (2 reviews)')
})