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

// ---------------------------------------------------------------------------
// More Makan Kakis tests (Silver, M3): checks, rename, kick, leave, delete,
// and protecting the group owner inside a group session.
// ---------------------------------------------------------------------------

// Owner creates a group and a friend joins it. Returns the group code.
async function groupWithFriend(owner, friend, name) {
  await signUp(owner, 'owner')
  await owner.goto('/groups')
  await owner.getByTestId('group-name').fill(name)
  await owner.getByRole('button', { name: 'Create group' }).click()
  await expect(owner).toHaveURL(/\/groups\/[A-Z]{6}$/)
  const code = (await owner.getByTestId('group-code').textContent()).trim()

  await signUp(friend, 'friend')
  await friend.goto('/groups')
  await friend.getByTestId('group-join-code').fill(code)
  await friend.getByRole('button', { name: 'Join group' }).click()
  await expect(owner.getByTestId('group-members').locator('li')).toHaveCount(2)
  return code
}

test('groups: a name and a real 6-letter code are needed', async ({ page }) => {
  await signUp(page, 'checks')
  await page.goto('/groups')
  await page.getByRole('button', { name: 'Create group' }).click()
  await expect(page.getByText('Give your group a name')).toBeVisible()

  await page.getByTestId('group-join-code').fill('ABC')
  await page.getByRole('button', { name: 'Join group' }).click()
  await expect(page.getByText('Group codes have 6 letters')).toBeVisible()

  await page.getByTestId('group-join-code').fill('ZZZZZZ')
  await page.getByRole('button', { name: 'Join group' }).click()
  await expect(page.getByText('No group with that code')).toBeVisible()
})

test('groups: the owner renames the group and the friend sees it live', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  const friend = await (await browser.newContext()).newPage()
  await groupWithFriend(owner, friend, 'Old Name')

  owner.once('dialog', d => d.accept('Friday Lunch Club'))   // the "New group name" box
  await owner.getByRole('button', { name: 'Rename' }).click()
  await expect(friend.getByRole('heading', { name: 'Friday Lunch Club' })).toBeVisible()
  // Only the owner gets the Rename button
  await expect(friend.getByRole('button', { name: 'Rename' })).toHaveCount(0)
})

test('groups: owner removes a stranger, who cannot rejoin with the code', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  const stranger = await (await browser.newContext()).newPage()
  const code = await groupWithFriend(owner, stranger, 'Invite Only')

  owner.once('dialog', d => d.accept())   // "Remove ... from the group?"
  await owner.getByTestId('group-members').getByRole('button', { name: 'Remove' }).click()
  await expect(owner.getByTestId('group-members').locator('li')).toHaveCount(1)
  await expect(stranger.getByText('The owner removed you from')).toBeVisible()

  // Same code, but blocked now
  await stranger.goto('/groups')
  await stranger.getByTestId('group-join-code').fill(code)
  await stranger.getByRole('button', { name: 'Join group' }).click()
  await expect(stranger.getByText('The owner removed you from this group')).toBeVisible()
})

test('groups: a member leaves from the list and can rejoin with the code', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  const friend = await (await browser.newContext()).newPage()
  const code = await groupWithFriend(owner, friend, 'Leavers')

  await friend.goto('/groups')
  await expect(friend.getByTestId('group-list').locator('li')).toHaveCount(1)
  friend.once('dialog', d => d.accept())   // "Leave ...? You can rejoin later"
  await friend.getByRole('button', { name: 'Leave group' }).click()
  await expect(friend.getByText('No groups yet.')).toBeVisible()
  await expect(owner.getByTestId('group-members').locator('li')).toHaveCount(1)

  // Leaving is not a kick: the code still works
  await friend.getByTestId('group-join-code').fill(code)
  await friend.getByRole('button', { name: 'Join group' }).click()
  await expect(owner.getByTestId('group-members').locator('li')).toHaveCount(2)
})

test('groups: the owner deletes the group from the list and it disappears for everyone', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  const friend = await (await browser.newContext()).newPage()
  await groupWithFriend(owner, friend, 'Short Lived')

  await friend.goto('/groups')
  await expect(friend.getByTestId('group-list')).toContainText('Short Lived')
  // The friend only gets "Leave", never "Delete"
  await expect(friend.getByRole('button', { name: 'Delete group' })).toHaveCount(0)

  await owner.goto('/groups')
  owner.once('dialog', d => d.accept())   // "Delete ... for everyone?"
  await owner.getByRole('button', { name: 'Delete group' }).click()
  await expect(owner.getByText('No groups yet.')).toBeVisible()
  await expect(friend.getByText('No groups yet.')).toBeVisible()   // live, no refresh
})

test('groups: in a group session, the host cannot remove the group owner', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  const friend = await (await browser.newContext()).newPage()
  await groupWithFriend(owner, friend, 'Owner Stays')

  // The FRIEND starts the session, so the friend is the host
  await friend.getByRole('button', { name: 'Start a Makan Session' }).click()
  await expect(friend).toHaveURL(/\/sessions\/[A-Z]{6}$/)
  await owner.getByRole('button', { name: 'Join live session' }).click()
  await expect(friend.getByTestId('member-list').locator('li')).toHaveCount(2)

  // A third person joins with the session code
  const sessionCode = (await friend.getByTestId('session-code').textContent()).trim()
  const third = await (await browser.newContext()).newPage()
  await signUp(third, 'third')
  await third.getByTestId('join-code').fill(sessionCode)
  await third.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(friend.getByTestId('member-list').locator('li')).toHaveCount(3)

  // The host gets a Remove button for the third person, but NOT for the group owner
  const removeButtons = friend.getByTestId('member-list').getByRole('button', { name: /^Remove / })
  await expect(removeButtons).toHaveCount(1)
  await expect(removeButtons).toHaveAccessibleName(/^Remove third-/)
})