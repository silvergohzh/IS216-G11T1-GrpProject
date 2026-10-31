// Owner: M3. The Makan Quest home page: island ticks (reset daily), Today's Quests,
// this week's leaderboard, the loading screen, the sound button, and profile diets.
import { test, expect } from '@playwright/test'
import { signUp, logIn } from './helpers.js'
import { newPerson, openLobby, startVotingNoTimer } from './session-helpers.js'

// On the phone layout the top-bar buttons are inside the ☰ menu
async function openMenuIfPhone(page) {
  const menu = page.getByTestId('menu-toggle')
  if (await menu.isVisible()) await menu.click()
}

test('guests: the loading screen goes away and the home cards ask them to log in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('loading-screen')).toHaveCount(0, { timeout: 10000 })
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Where we makan today?')
  await expect(page.getByTestId('visited-count')).toContainText('0 of 6 stations visited today')
  await expect(page.getByTestId('today-quests')).toContainText("TODAY'S QUESTS · 0 OF 4")
  await expect(page.getByTestId('today-quests')).toContainText('Log in to track your quests.')
  await expect(page.getByTestId('home-leaderboard')).toContainText("Log in to see who's leading this week.")
})

test('island: a visited station gets a tick, kept after refresh, same on every device for that account, and reset the next day', async ({ page, browser }) => {
  const email = await signUp(page, 'island')
  await page.goto('/')
  const count = page.getByTestId('visited-count')
  await expect(count).toContainText('0 of 6')

  // Visit Hidden Gems from the island
  await page.getByRole('button', { name: 'Station 3, Hidden Gems' }).click()
  await page.getByRole('link', { name: 'Explore gems' }).click()
  await expect(page).toHaveURL(/\/gems$/)

  // Back home: ticked, and still ticked after a refresh
  await page.goto('/')
  await expect(count).toContainText('1 of 6')
  await expect(page.getByRole('button', { name: 'Station 3, Hidden Gems, visited' })).toBeVisible()
  await page.reload()
  await expect(count).toContainText('1 of 6')

  // A different account on another browser starts with no ticks
  const other = await newPerson(browser)
  await signUp(other, 'island-other')
  await other.goto('/')
  await expect(other.getByTestId('visited-count')).toContainText('0 of 6')

  // Same account on ANOTHER browser/phone: the tick follows the account
  const laptop = await newPerson(browser)
  await logIn(laptop, email)
  await laptop.goto('/')
  await expect(laptop.getByTestId('visited-count')).toContainText('1 of 6')

  // Tomorrow (clock moved 1 day ahead): today's doc is new, so it starts empty
  const tomorrow = await newPerson(browser)
  await tomorrow.clock.setFixedTime(new Date(Date.now() + 24 * 60 * 60 * 1000))
  await logIn(tomorrow, email)
  await tomorrow.goto('/')
  await expect(tomorrow.getByTestId('visited-count')).toContainText('0 of 6')
})

test("quests: your Super Like wins -> Finish + Win quests tick (guest only gets Finish), and the home leaderboard shows", async ({ browser }) => {
  const host = await newPerson(browser)
  const guest = await newPerson(browser)

  const code = await openLobby(host, guest)

  // New account: no quests done yet
  await host.goto('/')
  await expect(host.getByTestId('today-quests')).toContainText("TODAY'S QUESTS · 0 OF 4")

  // Back to the lobby. Host ⭐ Super Likes the first card, guest says yes -> that card wins
  await host.goto(`/sessions/${code}`)
  await expect(host.getByTestId('member-list').locator('li')).toHaveCount(2)
  await startVotingNoTimer(host, guest)
  await host.getByTestId('vote-super').click()
  await guest.getByTestId('vote-yes').click()
  await expect(host.getByTestId('winner-name')).toBeVisible({ timeout: 15000 })

  // Host: "Finish a Makan Session" and "Win with your Super Like" are both done
  await host.goto('/')
  await expect(host.getByTestId('today-quests')).toContainText("TODAY'S QUESTS · 2 OF 4")
  await expect(host.getByTestId('quest-session')).toContainText('(done)')
  await expect(host.getByTestId('quest-win')).toContainText('(done)')
  await expect(host.getByTestId('quest-gem')).not.toContainText('(done)')

  // Guest: finished, but only voted a plain yes (no Super Like), so no win
  await guest.goto('/')
  await expect(guest.getByTestId('today-quests')).toContainText("TODAY'S QUESTS · 1 OF 4")
  await expect(guest.getByTestId('quest-win')).not.toContainText('(done)')

  // The leaderboard has people on it this week
  await expect(host.getByTestId('home-leader').first()).toBeVisible()
  expect(await host.getByTestId('home-leader').count()).toBeLessThanOrEqual(5)
  await host.getByRole('link', { name: 'Full leaderboard' }).click()
  await expect(host).toHaveURL(/\/points$/)
})

test('quests: adding a Hidden Gem ticks the gem quest', async ({ page }) => {
  await signUp(page, 'quest-gem')
  await page.goto('/gems')
  await page.getByLabel('Stall or shop').fill('Quest Gem ' + Date.now())
  await page.getByLabel('Must try').fill('Mee rebus')
  await page.getByLabel('Cuisine').fill('Malay')
  await page.getByLabel('Address').fill('1 Test Street')
  await page.getByTestId('map').click()            // a gem needs a location
  await page.getByRole('button', { name: 'Add gem' }).click()
  await expect(page.getByTestId('gem-row').first()).toBeVisible()

  await page.goto('/')
  await expect(page.getByTestId('quest-gem')).toContainText('(done)')
  await expect(page.getByTestId('today-quests')).toContainText("TODAY'S QUESTS · 1 OF 4")
})

test('profile: only halal and vegetarian, and the saved diet fills in the Makan Session form', async ({ page }) => {
  await signUp(page, 'diet')
  await page.goto('/profile')
  await expect(page.getByLabel('no-beef')).toHaveCount(0)
  await page.getByLabel('halal').check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Profile saved')).toBeVisible()

  await page.goto('/sessions')
  await expect(page.getByLabel('halal')).toBeChecked()
  await expect(page.getByLabel('vegetarian')).not.toBeChecked()
})

test('sound: the 🔊 button mutes sounds and remembers it after a refresh', async ({ page }) => {
  await page.goto('/')
  await openMenuIfPhone(page)
  const toggle = page.getByTestId('sound-toggle')
  await expect(toggle).toHaveAccessibleName('Turn sound off')
  await toggle.click()
  await expect(toggle).toHaveAccessibleName('Turn sound on')

  await page.reload()
  await openMenuIfPhone(page)
  await expect(page.getByTestId('sound-toggle')).toHaveAccessibleName('Turn sound on')
  expect(await page.evaluate(() => localStorage.getItem('chopeless:muted'))).toBe('1')
})