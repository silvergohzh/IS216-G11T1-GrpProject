// "Find on map" on the Hidden Gems form. Owner: M2 (Nawaz)
// The address lookup is faked with page.route, so the test never calls the real Nominatim
// (the request never even reaches our server).
import { test, expect } from '@playwright/test'
import { signUp } from './helpers.js'

// Two made-up matches, in the same shape our server sends: { results: [{ label, lat, lng }] }
const RESULTS = [
  { label: '270, Queen Street, Bugis, Singapore, 180270', lat: 1.3016, lng: 103.8529 },
  { label: 'Waterloo Centre, 261, Waterloo Street, Singapore', lat: 1.2996, lng: 103.853 }
]

test('gem form: "Find on map" puts the pin on the address, and the gem can be added', async ({ page }) => {
  // Answer every address lookup with the made-up matches, and remember what was asked
  const asked = []
  await page.route('**/api/geocode?**', route => {
    asked.push(new URL(route.request().url()).searchParams.get('q'))
    return route.fulfill({ json: { results: RESULTS } })
  })

  await signUp(page, 'geocode')
  await page.goto('/gems')

  const name = 'Lookup Stall ' + Date.now()
  await page.getByLabel('Stall or shop').fill(name)
  await page.getByLabel('Cuisine').fill('Hawker')
  await page.getByLabel('Min price ($)').fill('4')
  await page.getByLabel('Max price ($)').fill('8')
  await page.getByLabel('Typical wait (minutes)').fill('10')
  await page.locator('#g-photo').setInputFiles('e2e/fixtures/gem-test.png')
  await expect(page.getByAltText('Preview of the place')).toBeVisible()

  // The button waits for an address
  const findButton = page.getByTestId('find-on-map')
  await expect(findButton).toBeDisabled()
  await page.getByLabel('Address').fill('270 Queen Street')
  await findButton.click()

  // The pin goes to the first match, and the label shows what was found
  await expect(page.getByText('Picked: 1.30160, 103.85290')).toBeVisible()
  await expect(page.getByTestId('geocode-found')).toHaveText('Found: 270, Queen Street, Bugis, Singapore, 180270')
  expect(asked).toEqual(['270 Queen Street'])

  // The other match is offered as a button, and choosing it moves the pin
  await page.getByTestId('geocode-other').filter({ hasText: 'Waterloo Centre' }).click()
  await expect(page.getByText('Picked: 1.29960, 103.85300')).toBeVisible()
  await expect(page.getByTestId('geocode-found')).toContainText('Waterloo Centre')

  // Add the gem: it shows on the board. Then delete it, so other tests start from the same list.
  await page.getByRole('button', { name: 'Add gem' }).click()
  const row = page.getByTestId('gem-row').filter({ hasText: name })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(row).toHaveCount(0)
})
