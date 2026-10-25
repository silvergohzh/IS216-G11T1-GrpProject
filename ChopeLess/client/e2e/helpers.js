// Shared test helpers. Owner: M6
import { expect } from '@playwright/test'

// Creates a brand-new account (unique email every run) and lands on the Makan Session page
export async function signUp(page, name = 'tester') {
  const email = `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`
  await page.goto('/login')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('test1234')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page).toHaveURL(/\/sessions$/)
  return email
}

// Logs in to an existing account, e.g. the test accounts made by server/seed/platform.js:
//   diner@chopeless.test, hawker@chopeless.test, admin@chopeless.test (password test1234)
export async function logIn(page, email, password = 'test1234') {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/sessions$/)
}
