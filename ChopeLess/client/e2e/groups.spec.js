// Owner: M3. A friend group starts a session in one tap and a member joins from the group page.
import { test, expect } from '@playwright/test'
import { signUp } from './helpers.js'

test('group: create, join by code, start a session, member joins live', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  const friend = await (await browser.newContext()).newPage()

  // Owner creates a group
  await signUp(owner, 'owner')
  await owner.goto('/groups')
  await owner.getByTestId('group-name').fill('SMU Makan Kakis')
  await owner.getByRole('button', { name: 'Create group' }).click()
  await expect(owner).toHaveURL(/\/groups\/[A-Z]{6}$/)
  const code = await owner.getByTestId('group-code').textContent()

  // Friend joins with the code; the owner's member list updates live
  await signUp(friend, 'friend')
  await friend.goto('/groups')
  await friend.getByTestId('group-join-code').fill(code)
  await friend.getByRole('button', { name: 'Join group' }).click()
  await expect(owner.getByTestId('group-members').locator('li')).toHaveCount(2)

  // Owner starts a session; the friend sees the live banner and joins
  await owner.getByRole('button', { name: 'Start a Makan Session' }).click()
  await expect(owner).toHaveURL(/\/sessions\/[A-Z]{6}$/)
  await friend.getByRole('button', { name: 'Join live session' }).click()
  await expect(owner.getByTestId('member-list').locator('li')).toHaveCount(2)
})