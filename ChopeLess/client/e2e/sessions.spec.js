// Owner: M3 (front-end) and M1 (back-end rules). Two people, two browsers, one live session.
import { test, expect } from '@playwright/test'
import { signUp } from './helpers.js'

test('two members join, vote yes on the same place, and both see the winner', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage()
  const guest = await (await browser.newContext()).newPage()

  // Host creates a session
  await signUp(host, 'host')
  await host.getByTestId('create-session').click()
  const code = await host.getByTestId('session-code').textContent()

  // Guest joins with the code; the host's lobby updates live
  await signUp(guest, 'guest')
  await guest.getByTestId('join-code').fill(code)
  await guest.getByRole('button', { name: 'Join' }).click()
  await expect(host.getByTestId('member-list').locator('li')).toHaveCount(2)

  // Host starts voting; both phones move to the vote page
  await host.getByRole('button', { name: 'Start voting' }).click()
  await expect(host).toHaveURL(/\/vote$/)
  await expect(guest).toHaveURL(/\/vote$/)


  // Both say yes to the first card (shortest walk + wait, from the seed data).
  // Read its name from the card, so the test still works when the seed data changes.
  const firstPlace = (await host.getByTestId('swipe-card').locator('h3').first().textContent()).trim()
  await host.getByTestId('vote-yes').click()      // host taps the ✓ button
  await guest.keyboard.press('ArrowRight')         // guest uses the keyboard shortcut

  // The winner page shows a capsule first: tap it to reveal the winner (it may also open by itself)
  await host.getByRole('button', { name: 'Open the capsule' }).click({ timeout: 5000 }).catch(() => {})
  await guest.getByRole('button', { name: 'Open the capsule' }).click({ timeout: 5000 }).catch(() => {})

  await expect(host.getByTestId('winner-name')).toContainText(firstPlace)
  await expect(guest.getByTestId('winner-name')).toContainText(firstPlace)
  await expect(host.getByRole('link', { name: 'Get walking directions' })).toBeVisible()
})
 
