// Owner: M4
import { test, expect } from '@playwright/test'

// A tiny 2x2 PNG, so the test doesn't need an image file on disk
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64')

test('QueueLess lists seeded places with a crowd level', async ({ page }) => {
  await page.goto('/queueless')
  await expect(page.getByTestId('place-row')).toHaveCount(3)
  await expect(page.getByTestId('place-row').filter({ hasText: 'Bras Basah' })).toContainText('Quiet')

  await page.getByTestId('place-row').filter({ hasText: 'Albert Centre' }).click()
  await expect(page.getByRole('heading', { name: 'Average wait by hour' })).toBeVisible()
  await expect(page.getByTestId('best-time')).toContainText('Best time to go')
})

test('Anyone can upload a photo without logging in', async ({ page }) => {
  await page.goto('/places/waterloo-centre')
  await expect(page.getByTestId('analyse-btn')).toBeDisabled()

  await page.getByTestId('photo-input').setInputFiles({ name: 'queue.png', mimeType: 'image/png', buffer: PNG })
  await page.getByTestId('analyse-btn').click()
  // Without OPENAI_API_KEY the server returns a sample estimate
  await expect(page.getByTestId('analysis-result')).toContainText('min wait')
  await expect(page.getByTestId('latest')).toContainText('just now')
})
