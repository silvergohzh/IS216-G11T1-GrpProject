// Owner: M4
// Type: E2E test (the real website, server and Firebase emulators in a real Chrome, at desktop and phone size)
import { test, expect } from '@playwright/test'

// A tiny 2x2 PNG, so the test doesn't need an image file on disk
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64')

// Test that the QueueLess page lists seeded places and shows a crowd level, and that anyone can upload a photo without logging in
test('QueueLess lists seeded places with a crowd level', async ({ page }) => {
  await page.goto('/queueless')
  // At least the 14 places from server/seed/places.json (stalls approved by an admin are added too)
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  expect(await page.getByTestId('place-row').count()).toBeGreaterThanOrEqual(14)
  const brasBasah = page.getByTestId('place-row').filter({ hasText: 'Bras Basah' })
  await expect(brasBasah).toContainText('Quiet')
  // Each row says when its estimate is from, e.g. "24% seats taken as of 6:34 pm"
  await expect(brasBasah).toContainText(/seats taken as of .*\d{1,2}:\d{2}\s?[ap]m/)

  await page.getByTestId('place-row').filter({ hasText: 'Albert Centre' }).click()
  await expect(page.getByRole('heading', { name: 'Average Wait Time' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Average wait by hour' })).toBeVisible()
  await expect(page.getByTestId('best-time')).toContainText('Best time to go')
})

// Test that tapping an hour's bar shows that hour's averages
test('Tapping an hour on the chart shows its stats', async ({ page }) => {
  await page.goto('/places/albert-centre')
  // Pick a bar that isn't already open (the current hour starts open)
  const label = await page.locator('[data-testid="hour-bar"][aria-pressed="false"]').first().getAttribute('aria-label') // e.g. "8am: about 6 min wait"
  const bar = page.getByRole('button', { name: label, exact: true }) // fixed to this hour, even once it's open
  await bar.click()

  await expect(bar).toHaveAttribute('aria-pressed', 'true')
  const stats = page.getByTestId('hour-stats')
  await expect(stats).toContainText(`${label.split(':')[0]} to`) // "8am to 9am"
  await expect(stats).toContainText('min wait')
  await expect(stats).toContainText('Average of')

  await bar.click() // tap again to close
  await expect(stats).toHaveCount(0)
})

// Test that See Live Queue shows a photo from the place and the AI's estimate, without logging in
test('See Live Queue shows a live photo and estimate', async ({ page }) => {
  // Waterloo Centre, which the upload test below also changes, so other tests' seeded numbers stay as they are
  await page.goto('/places/waterloo-centre')

  await page.getByTestId('live-btn').click()
  // Without OPENAI_API_KEY the server returns a sample estimate for a random photo in test_pictures/actual
  await expect(page.getByTestId('live-result')).toContainText(/Live check: we estimate \d+ people in the queue, about \d+ min wait/)
  const photo = page.getByTestId('live-photo')
  await expect(photo).toBeVisible()
  await expect.poll(() => photo.evaluate(img => img.naturalWidth)).toBeGreaterThan(0) // the image really loaded
  await expect(page.getByTestId('latest')).toContainText('just now')
})

// Test that anyone can upload a photo without logging in
test('Anyone can upload a photo without logging in', async ({ page }) => {
  await page.goto('/places/waterloo-centre')
  await expect(page.getByTestId('analyse-btn')).toBeDisabled()

  await page.getByTestId('photo-input').setInputFiles({ name: 'queue.png', mimeType: 'image/png', buffer: PNG })
  await page.getByTestId('analyse-btn').click()
  // Without OPENAI_API_KEY the server returns a sample estimate
  await expect(page.getByTestId('analysis-result')).toContainText('min wait')
  await expect(page.getByTestId('latest')).toContainText('just now')
})
