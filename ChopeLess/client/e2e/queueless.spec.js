// Owner: M4
import { test, expect } from '@playwright/test'

test('QueueLess lists seeded places with a crowd level', async ({ page }) => {
  await page.goto('/queueless')
  await expect(page.getByTestId('place-row')).toHaveCount(3)
  await expect(page.getByTestId('place-row').filter({ hasText: 'Bras Basah' })).toContainText('Quiet')

  await page.getByTestId('place-row').filter({ hasText: 'Albert Centre' }).click()
  await expect(page.getByRole('heading', { name: 'Average wait by hour' })).toBeVisible()
})
