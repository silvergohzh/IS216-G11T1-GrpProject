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

  // Both say yes to the first card (shortest walk + wait, from the seed data)
  await host.getByTestId('vote-yes').click()
  await guest.getByTestId('vote-yes').click()

  await expect(host.getByTestId('winner-name')).toHaveText('Bras Basah Complex food court')
  await expect(guest.getByTestId('winner-name')).toHaveText('Bras Basah Complex food court')
})
