// Owner: M3 (front-end) and M1 (back-end rules). Two people, two browsers, one live session.
import { test, expect } from '@playwright/test'
import { createRequire } from 'module'   // [NAWAZ] for resetSeededQueueTimes (Round 2 test)
import { signUp, logIn } from './helpers.js'
import { newPerson, openLobby, startVotingNoTimer, cardName, voteThrough, setMeetingPoint } from './session-helpers.js'

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

  // Host picks the meeting point and starts voting; both phones move to the vote page
  await setMeetingPoint(host)
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

// ---------------------------------------------------------------------------
// More Makan Session tests (Silver, M3): form checks, lobby, kick, Super Like,
// veto, tie break and the winner page. Each test uses brand-new accounts.
// ---------------------------------------------------------------------------

test('session form: checks the name and the code before joining', async ({ page }) => {
  await signUp(page, 'form')
  // No name -> friendly message, nothing created
  await page.getByLabel('Name').fill('')
  await page.getByTestId('create-session').click()
  await expect(page.getByText('Please enter your name.')).toBeVisible()
  await expect(page).toHaveURL(/\/sessions$/)

  // A code that doesn't exist
  await page.getByLabel('Name').fill('Tester')
  await page.getByTestId('join-code').fill('ZZZZZZ')
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page.getByText('No session with that code')).toBeVisible()

  // Only the diets our places are tagged with (no-beef was removed)
  await expect(page.getByLabel('halal')).toBeVisible()
  await expect(page.getByLabel('vegetarian')).toBeVisible()
  await expect(page.getByLabel('no-beef')).toHaveCount(0)
})

test('lobby: only the host changes the rules, and everyone sees them live', async ({ browser }) => {
  const host = await newPerson(browser)
  const guest = await newPerson(browser)

  // Alone: voting can't start yet
  await signUp(host, 'host')
  await host.getByTestId('create-session').click()
  await expect(host.getByRole('button', { name: 'Start voting' })).toBeDisabled()
  await expect(host.getByText('you need at least 2 people')).toBeVisible()
  const code = (await host.getByTestId('session-code').textContent()).trim()

  await signUp(guest, 'guest')
  await guest.getByTestId('join-code').fill(code)
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(host.getByTestId('member-list').locator('li')).toHaveCount(2)
  await setMeetingPoint(host)
  await expect(host.getByRole('button', { name: 'Start voting' })).toBeEnabled()

  // Host switches to takeaway and a 15-minute walk: the guest's lobby updates by itself
  await host.getByTestId('service-mode').getByRole('button', { name: /Takeaway/ }).click()
  await expect(guest.getByTestId('service-mode').getByRole('button', { name: /Takeaway/ })).toHaveClass(/bg-ink/)
  await host.getByLabel('Max walk (min)').fill('15')
  await host.getByLabel('Max walk (min)').press('Tab')
  await expect(guest.getByLabel('Max walk (min)')).toHaveValue('15')

  // The guest can look but not change anything
  await expect(guest.getByTestId('service-mode').getByRole('button', { name: /Dine in/ })).toBeDisabled()
  await expect(guest.getByLabel('Max walk (min)')).toBeDisabled()
  await expect(guest.getByRole('button', { name: 'Start voting' })).toHaveCount(0)

  // "Waiting for the host" is only for guests, not the host
  await expect(guest.getByText('Waiting for the host to start…')).toBeVisible()
  await expect(host.getByText('Waiting for the host to start…')).toHaveCount(0)
})

test('lobby: the host removes someone, and they cannot rejoin with the code', async ({ browser }) => {
  const host = await newPerson(browser)
  const guest = await newPerson(browser)
  const code = await openLobby(host, guest)

  host.once('dialog', d => d.accept())   // "Remove ... from this session?"
  await host.getByTestId('member-list').getByRole('button', { name: /^Remove / }).click()
  await expect(host.getByTestId('member-list').locator('li')).toHaveCount(1)
  await expect(guest.getByText('The host removed you from this session.')).toBeVisible()

  // Same code again: blocked
  await guest.goto('/sessions')
  await guest.getByTestId('join-code').fill(code)
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(guest.getByText('The host removed you from this session')).toBeVisible()
  await expect(guest).toHaveURL(/\/sessions$/)
})

test('lobby: a guest who leaves can join again, and outsiders cannot see the lobby', async ({ browser }) => {
  const host = await newPerson(browser)
  const guest = await newPerson(browser)
  const code = await openLobby(host, guest)

  guest.once('dialog', d => d.accept())  // "Leave this session?"
  await guest.getByRole('button', { name: 'Leave session' }).click()
  await expect(guest).toHaveURL(/\/sessions$/)
  await expect(host.getByTestId('member-list').locator('li')).toHaveCount(1)

  // Leaving is not a kick, so the code still works
  await guest.getByTestId('join-code').fill(code)
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(host.getByTestId('member-list').locator('li')).toHaveCount(2)

  // Someone who never joined opens the lobby link
  const outsider = await newPerson(browser)
  await signUp(outsider, 'outsider')
  await outsider.goto(`/sessions/${code}`)
  await expect(outsider.getByText("You're not part of this session.")).toBeVisible()
  await expect(outsider.getByTestId('member-list')).toHaveCount(0)
})

test('vote: Super Like and Veto show up live on the other phone, then the group agrees', async ({ browser }) => {
  const host = await newPerson(browser)
  const guest = await newPerson(browser)
  await openLobby(host, guest)
  await startVotingNoTimer(host, guest)
  await expect(host.getByTestId('countdown')).toHaveCount(0)   // "No timer" really has no countdown

  // Host Super Likes card 1 (the free one)
  const first = await cardName(host)
  await expect(host.getByText('1 Super Like(s) left')).toBeVisible()
  await host.getByTestId('vote-super').click()
  await expect(guest.getByTestId('tally-row').filter({ hasText: first })).toContainText('⭐×1')
  await expect(host.getByText('Next ⭐ costs 20 pts')).toBeVisible()

  // Host vetoes card 2: it's crossed out for everyone and the Veto button is used up
  const second = await cardName(host)
  expect(second).not.toBe(first)
  await host.getByTestId('vote-veto').click()
  await expect(guest.getByTestId('tally-row').filter({ hasText: second })).toContainText('Vetoed by')
  await expect(host.getByText('🚫 Veto used')).toBeVisible()
  await expect(host.getByTestId('vote-veto')).toBeDisabled()

  // Guest says yes to card 1 -> everyone agrees -> both phones go to the winner
  expect(await cardName(guest)).toBe(first)
  await guest.getByTestId('vote-yes').click()
  await expect(host.getByTestId('winner-name')).toHaveText(first, { timeout: 15000 })
  await expect(guest.getByTestId('winner-name')).toHaveText(first, { timeout: 15000 })
})

test('vote: a second Super Like costs 20 points and the tally counts both (and no points = clear message)', async ({ browser }) => {
  const host = await newPerson(browser)
  const guest = await newPerson(browser)

  // alice is a demo account with 1000 points (server/seed/platform.js)
  await logIn(host, 'alice@chopeless.test')
  await expect(host.getByLabel('Name')).toHaveValue('Alice Tan')   // wait for her profile to fill the form
  await host.getByLabel('Budget ($)').fill('30')                     // bigger budget = more places to vote on
  await host.getByTestId('create-session').click()
  const code = (await host.getByTestId('session-code').textContent()).trim()

  await signUp(guest, 'nopoints')                                    // a new account has 0 points
  await expect(guest.getByLabel('Name')).toHaveValue(/^nopoints-/)
  await guest.getByLabel('Budget ($)').fill('30')
  await guest.getByTestId('join-code').fill(code)
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(host.getByTestId('member-list').locator('li')).toHaveCount(2)
  await startVotingNoTimer(host, guest)

  // GUEST first: free Super Like on card 1...
  const first = await cardName(guest)
  await guest.getByTestId('vote-super').click()
  // ...then none left and 0 points: buying one fails with a clear message (no vote is saved)
  await expect(guest.getByTestId('vote-super')).toContainText('20 pts')
  guest.once('dialog', d => d.accept())
  await guest.getByTestId('vote-super').click()
  await expect(guest.getByText('Not enough Makan Points')).toBeVisible()

  // HOST (alice): no to card 1 (so the vote doesn't end), free Super Like on card 2...
  expect(await cardName(host)).toBe(first)
  await host.getByTestId('vote-no').click()
  await expect.poll(() => cardName(host)).not.toBe(first)
  const second = await cardName(host)
  await host.getByTestId('vote-super').click()
  // ...then the ⭐ button asks to spend 20 points on card 3 and uses it straight away
  await expect.poll(() => cardName(host)).not.toBe(second)
  const third = await cardName(host)
  await expect(host.getByTestId('vote-super')).toContainText('20 pts')
  host.once('dialog', d => d.accept())
  await host.getByTestId('vote-super').click()
  await expect(host.getByText('Super Like bought: 20 Makan Points used.')).toBeVisible()

  // The bug that was fixed: the free AND the bought Super Like both show on the other phone
  await expect(guest.getByTestId('tally-row').filter({ hasText: second })).toContainText('⭐×1')
  await expect(guest.getByTestId('tally-row').filter({ hasText: third })).toContainText('⭐×1')
  await expect(host.getByTestId('tally-row').filter({ hasText: first })).toContainText('⭐×1')
})

test('tie: highest scoring places go to gacha in Round 1, and both phones get the same winner', async ({ browser }) => {
  test.setTimeout(120_000)

  const host = await newPerson(browser)
  const guest = await newPerson(browser)

  await openLobby(host, guest)
  await startVotingNoTimer(host, guest)

  // Host likes card 1, guest likes card 2.
  // Both receive one Yes, so both are eligible
  // under the new Round 1 rules.
  await voteThrough(host, 0)
  await voteThrough(guest, 1, false)

  // Both restaurants tie for the highest score.
  // Round 1 should proceed directly to gacha.
  await expect(
    host.getByRole('heading', { name: "It's a tie!" })
  ).toBeVisible({ timeout: 30000 })

  await expect(
    host.getByTestId('spin-wheel').locator('ol li')
  ).toHaveCount(2)

  // Both users should receive the same final winner.
  await expect(
    host.getByTestId('winner-name')
  ).toBeVisible({ timeout: 30000 })

  await expect(
    guest.getByTestId('winner-name')
  ).toBeVisible({ timeout: 30000 })

  const winner = (
    await host.getByTestId('winner-name').textContent()
  ).trim()

  await expect(
    guest.getByTestId('winner-name')
  ).toHaveText(winner)
})

test('winner: walking directions, Meal History and starting again', async ({ browser }) => {
  const host = await newPerson(browser)
  const guest = await newPerson(browser)
  await openLobby(host, guest)
  await startVotingNoTimer(host, guest)

  const first = await cardName(host)
  await host.getByTestId('vote-yes').click()
  await guest.getByTestId('vote-yes').click()
  await expect(host.getByTestId('winner-name')).toHaveText(first, { timeout: 15000 })

  // Google Maps link: walking directions to the winner
  const href = await host.getByRole('link', { name: 'Get walking directions' }).getAttribute('href')
  expect(href).toContain('google.com/maps/dir/')
  expect(href).toContain('travelmode=walking')
  expect(href).toMatch(/destination=-?\d+(\.\d+)?,-?\d+(\.\d+)?/)

  // The meal is saved to Meal History for both people
  await host.goto('/history')
  await expect(host.getByText(first).first()).toBeVisible()
  await guest.goto('/history')
  await expect(guest.getByText(first).first()).toBeVisible()

  // "Start another session" goes back to the start
  await host.goBack()
  await host.getByRole('link', { name: 'Start another session' }).click()
  await expect(host).toHaveURL(/\/sessions$/)
})
 

// [NAWAZ] START: the host must choose a meeting point before voting
test('lobby: Start voting stays off until the host picks a meeting point', async ({ browser }) => {
  const host = await newPerson(browser)
  const guest = await newPerson(browser)
  await openLobby(host, guest)

  // Two people are here, but there is no meeting point yet
  const start = host.getByRole('button', { name: 'Start voting' })
  await expect(start).toBeDisabled()
  await expect(host.getByTestId('meeting-point-required')).toBeVisible()
  await expect(guest.getByTestId('meeting-point-required')).toHaveCount(0)   // only the host is told

  // The host taps the map: the message goes away and voting can start
  await host.getByTestId('map').click()
  await expect(host.getByTestId('meeting-point-required')).toHaveCount(0)
  await expect(start).toBeEnabled()
})

test('lobby: "Use my current location" sets the meeting point', async ({ browser }) => {
  // The host's browser shares a made-up location (Bras Basah) without asking
  const hostContext = await browser.newContext({
    geolocation: { latitude: 1.2967, longitude: 103.8537 },
    permissions: ['geolocation']
  })
  const host = await hostContext.newPage()
  const guest = await newPerson(browser)
  await openLobby(host, guest)

  await expect(guest.getByTestId('use-my-location')).toHaveCount(0)   // only the host gets the button
  await host.getByTestId('use-my-location').click()
  await expect(host.getByTestId('meeting-point-required')).toHaveCount(0)
  await expect(host.getByRole('button', { name: 'Start voting' })).toBeEnabled()
})

test('shortlist: a place further than the walk limit is left out', async ({ browser }) => {
  const host = await newPerson(browser)
  const guest = await newPerson(browser)
  await openLobby(host, guest)

  // A 7-minute walk limit. From SMU (the middle of the map), Bras Basah Complex is about 6 minutes away
  // and Albert Centre about 10. Albert Centre fits everything else (cheap, short queue), so only
  // the walk limit can take it off the list.
  await host.getByLabel('Max walk (min)').fill('7')
  await host.getByLabel('Max walk (min)').press('Tab')
  await expect(guest.getByLabel('Max walk (min)')).toHaveValue('7')
  await startVotingNoTimer(host, guest)

  // Go through every card (say no to each) and write down the names
  const progress = host.getByText(/\d+\/\d+ done/)
  const total = Number((await progress.textContent()).match(/(\d+)\/(\d+) done/)[2])
  const names = []
  for (let i = 0; i < total; i++) {
    await expect(progress).toContainText(`${i}/${total} done`)
    names.push(await cardName(host))
    await host.getByTestId('vote-no').click()
  }

  expect(names).toContain('Bras Basah Complex food court')
  expect(names).not.toContain('Albert Centre Market & Food Centre')
})
// [NAWAZ] END

// [NAWAZ] START: Round 2 shows only places the group hasn't seen

// Puts every seeded place's queue estimate ("latest") back to its value in server/seed/places.json.
// Why: all tests share one database, and other tests change these waits (the QueueLess photo upload
// saves a random wait for Waterloo Centre). The Round 2 counts depend on them.
// Only "latest" is rewritten, so accounts, points and everything else other tests use stay as they are.
// Returns the places whose wait changed, e.g. ["waterloo-centre: 17 -> 8"].
async function resetSeededQueueTimes() {
  // Use the server's firebase-admin (the client has no copy), pointed at the emulator, never a real database
  const requireFromServer = createRequire(new URL('../../server/package.json', import.meta.url))
  const { initializeApp, getApps } = requireFromServer('firebase-admin/app')
  const { getFirestore } = requireFromServer('firebase-admin/firestore')
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  const app = getApps().find(a => a.name === 'e2e-reset') || initializeApp({ projectId: 'demo-hiddengems' }, 'e2e-reset')
  const db = getFirestore(app)

  const seeded = requireFromServer('./seed/places.json')
  const changed = []
  const batch = db.batch()
  for (const p of seeded) {
    const ref = db.collection('places').doc(p.id)
    const before = (await ref.get()).data()?.latest?.waitMins
    if (before !== p.latestWaitMins) changed.push(`${p.id}: ${before} -> ${p.latestWaitMins}`)
    // The same shape server/seed/seed.js writes
    batch.update(ref, {
      latest: {
        peopleInQueue: Math.round(p.latestWaitMins / 0.8),
        waitMins: p.latestWaitMins,
        seatOccupancy: p.latestWaitMins * 6,
        confidence: 'medium',
        at: new Date().toISOString()
      }
    })
  }
  await batch.commit()
  return changed
}
// Says no to every card in this round and returns the names, in order.
// Waits for each vote to be saved (the "N/M done" count goes up) before the next one.
async function sayNoToAll(page) {
  const progress = page.getByText(/\d+\/\d+ done/)
  await expect(page.getByTestId('swipe-card')).toBeVisible()
  const total = Number((await progress.textContent()).match(/(\d+)\/(\d+) done/)[2])
  const names = []
  for (let i = 0; i < total; i++) {
    await expect(progress).toContainText(`${i}/${total} done`)
    names.push(await cardName(page))
    await page.getByTestId('vote-no').click()
  }
  await expect(progress).toContainText(`${total}/${total} done`)
  return names
}

test('round 2: nobody matched, so Round 2 shows only fresh places', async ({ browser }) => {
  // Start from the seeded queue times, whatever earlier tests did to them
  const changed = await resetSeededQueueTimes()
  console.log(`Queue times reset: ${changed.length ? changed.join(', ') : 'nothing had changed'}`)

  const host = await newPerson(browser)
  const guest = await newPerson(browser)
  await openLobby(host, guest)

  // Meeting point at SMU and the default limits. Walking is worked out offline (straight lines),
  // so Round 1 is the same 7 places every run.
  await startVotingNoTimer(host, guest)
  const round1 = await sayNoToAll(host)
  expect(round1).toHaveLength(7)

  // The guest says no to everything too. Their last vote ends Round 1 with no match.
  await voteThrough(guest, -1, false)

  // Round 2 starts by itself on both phones, with a fresh set of cards
  await expect(host.getByTestId('round-two')).toBeVisible()
  await expect(guest.getByTestId('round-two')).toBeVisible()
  await expect(host.getByText(/\d+\/\d+ done/)).toContainText(/ 0\/\d+ done/)

  const round2 = await sayNoToAll(host)
  console.log(`Round 2 has ${round2.length} places: ${round2.join(', ')}`)
  // 4 fresh places: Hot Spot, Taste Good, Ice Lab and Warung Leko. This number comes from the seeded places
  // and the offline (straight-line) walking estimate, so update it if the seed data changes.
  // (Before the Round 2 fix it was 3, because seen places used up some of the 8 slots.)
  expect(round2).toHaveLength(4)
  for (const name of round2) expect(round1).not.toContain(name)   // nothing from Round 1 comes back
})
// [NAWAZ] END
