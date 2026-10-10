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

test('a user can delete their account and can no longer log in', async ({ page }) => {
  const email = await signUp(page, 'delete')
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Delete account' }).click()
  await page.getByLabel('Confirm with your password').fill('test1234')
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await expect(page).toHaveURL(/\/$/)

  // Logged out: the profile page sends you to login, and the old password no longer works
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('test1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText('Wrong email or password.')).toBeVisible()
})

test('deleting an account needs the right password', async ({ page }) => {
  await signUp(page, 'delete-wrong')
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Delete account' }).click()
  await page.getByLabel('Confirm with your password').fill('not-my-password')
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await expect(page.getByText('Wrong password.')).toBeVisible()
  await expect(page).toHaveURL(/\/profile$/)
})
