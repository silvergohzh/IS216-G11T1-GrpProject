// Helpers for the Makan Session tests. Owner: M3 Silver
import { expect } from '@playwright/test'
import { signUp } from './helpers.js'

// A fresh browser (its own login) for each person in a test
export async function newPerson(browser) {
  return (await browser.newContext()).newPage()
}

// Host signs up and creates a session; guest signs up and joins with the code.
// Returns the 6-letter code once the host's lobby shows both people.
export async function openLobby(host, guest) {
  await signUp(host, 'host')
  await host.getByTestId('create-session').click()
  await expect(host).toHaveURL(/\/sessions\/[A-Z]{6}$/)
  const code = (await host.getByTestId('session-code').textContent()).trim()

  await signUp(guest, 'guest')
  await guest.getByTestId('join-code').fill(code)
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(guest).toHaveURL(new RegExp(`/sessions/${code}$`))
  await expect(host.getByTestId('member-list').locator('li')).toHaveCount(2)
  return code
}

// Host turns the vote timer off (so slow computers can't run out of time) and starts voting
export async function startVotingNoTimer(host, guest) {
  await host.getByLabel('Vote timer').selectOption('0')
  await expect(guest.getByLabel('Vote timer')).toHaveValue('0')   // the guest sees the change live
  await host.getByRole('button', { name: 'Start voting' }).click()
  await expect(host).toHaveURL(/\/vote$/)
  await expect(guest).toHaveURL(/\/vote$/)
  await expect(host.getByTestId('swipe-card')).toBeVisible()
}

// The name on the card someone is looking at
export async function cardName(page) {
  return (await page.getByTestId('swipe-card').locator('h3').first().textContent()).trim()
}

// Vote on every card in this round: YES on card number `yesAt` (0 = first), NO on the rest.
// Waits for each vote to be saved before the next one.
// waitForEnd = false for the LAST person to finish, because their final vote ends the round.
export async function voteThrough(page, yesAt, waitForEnd = true) {
  const progress = page.getByText(/\d+\/\d+ done/)
  await expect(page.getByTestId('swipe-card')).toBeVisible()
  const total = Number((await progress.textContent()).match(/(\d+)\/(\d+) done/)[2])
  for (let i = 0; i < total; i++) {
    await expect(progress).toContainText(`${i}/${total} done`)
    await page.getByTestId(i === yesAt ? 'vote-yes' : 'vote-no').click()
  }
  if (waitForEnd) await expect(progress).toContainText(`${total}/${total} done`)
}