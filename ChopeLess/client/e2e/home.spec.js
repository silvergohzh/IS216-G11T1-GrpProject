// Owner: M6
import { test, expect } from '@playwright/test'
import { signUp } from './helpers.js'

test('logged-out users are sent to the login page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('ChopeLess')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Decide where to eat')
  await page.getByRole('link', { name: 'Start a Makan Session' }).click()
  await expect(page).toHaveURL(/\/login/)
})

test('a new user can sign up and save their profile', async ({ page }) => {
  await signUp(page, 'profile')
  await page.goto('/profile')
  await page.getByLabel('Default budget ($)').fill('12')
  await page.getByLabel('halal').check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Profile saved')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Default budget ($)')).toHaveValue('12')
})
