// Owner: M5
import { test, expect } from '@playwright/test'
import { signUp } from './helpers.js'

test('add, edit and delete a gem', async ({ page }) => {
  await signUp(page, 'gems')
  await page.goto('/gems')

  const name = 'Test Stall ' + Date.now()
  await page.getByLabel('Stall or shop').fill(name)
  await page.getByLabel('Must try').fill('Mee rebus')
  await page.getByRole('button', { name: 'Add gem' }).click()
  const row = page.getByTestId('gem-row').filter({ hasText: name })
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Must try').fill('Lontong')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(row).toContainText('Lontong')

  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(row).toHaveCount(0)
})
