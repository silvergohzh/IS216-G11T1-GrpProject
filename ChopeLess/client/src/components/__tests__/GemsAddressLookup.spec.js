/* GemsAddressLookup.spec.js  Owner: M2 (Nawaz)
 Component tests for the "Find on map" address lookup in the Hidden Gems form (views/GemsView.vue).
 The user types an address, taps "Find on map", and the form:
   1. Puts the pin on the best match and shows "Found: <place>" and the picked coordinates
   2. Lists the other matches under "Not right? Try:", and moves the pin when one is chosen
   3. Says "Couldn't find that address, tap the map instead." when nothing matches
   4. Shows the problem when the lookup fails, and the form still works (the user can tap the map)
   5. Keeps the button off until there is an address to look up
 Test setup (the stubs idea from Week 10b):
   - our server is replaced by a fake api() that returns whatever each test needs, so no network is used
   - MapView is replaced by a small stub that shows how many markers it was given (the real map is tested in MapView.spec.js)
   - the logged-in user and the gems list are faked, so Firebase is never loaded
*/
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: vi.fn() }))
vi.mock('../../stores/auth', () => ({
  useAuthStore: () => ({ isLoggedIn: true, user: { uid: 'u1', name: 'Alice' } })
}))
vi.mock('../../services/gems', () => ({
  UPVOTES_NEEDED: 3,
  watchGems: (onChange) => { onChange([]); return () => {} },   // no gems on the board
  addGem: vi.fn(), updateGem: vi.fn(), deleteGem: vi.fn(), upvoteGem: vi.fn(), unvoteGem: vi.fn(),
  getReviews: vi.fn(), saveReview: vi.fn(), updateReview: vi.fn(), deleteReview: vi.fn(),
  photoToDataUrl: vi.fn(),
  getMenu: vi.fn(), addMenuItem: vi.fn(), updateMenuItem: vi.fn(), deleteMenuItem: vi.fn(),
  addMenuPhoto: vi.fn(), deleteMenuPhoto: vi.fn()
}))

import { api } from '../../lib/api'
import GemsView from '../../views/GemsView.vue'

// Two matches, like Nominatim would give for a postal code
const albert = { label: 'Albert Centre, 270 Queen Street', lat: 1.29953, lng: 103.85453 }
const other = { label: 'Albert Mall, Waterloo Street', lat: 1.2988, lng: 103.8531 }

// jsdom has no scrollIntoView, and the form calls it to bring the result into view
beforeAll(() => { Element.prototype.scrollIntoView = vi.fn() })
beforeEach(() => { api.mockReset() })

// Stub for the real map: just shows how many markers the form gave it
const MapViewStub = {
  props: ['markers'],
  template: '<div data-testid="map-stub">{{ markers.length }} marker(s)</div>'
}

function mountForm() {
  return mount(GemsView, { global: { stubs: { MapView: MapViewStub, GemMenu: true } } })
}

// Type an address and tap "Find on map"
async function findAddress(wrapper, text) {
  await wrapper.find('#g-addr').setValue(text)
  await wrapper.find('[data-testid="find-on-map"]').trigger('click')
  await flushPromises()
}

describe('Hidden Gems form: Find on map', () => {

  // Verify the best match gets the pin and the user is told what was found
  it('puts the pin on the best match and shows what was found', async () => {
    api.mockResolvedValue({ results: [albert, other] })
    const wrapper = mountForm()
    expect(wrapper.text()).toContain('No location picked yet')

    await findAddress(wrapper, '180270')

    expect(wrapper.find('[data-testid="geocode-found"]').text()).toBe('Found: Albert Centre, 270 Queen Street')
    expect(wrapper.text()).toContain('Picked: 1.29953, 103.85453')
    expect(wrapper.find('[data-testid="map-stub"]').text()).toBe('1 marker(s)')
  })

  // Verify the other matches are offered, and choosing one moves the pin
  it('offers the other matches and moves the pin when one is chosen', async () => {
    api.mockResolvedValue({ results: [albert, other] })
    const wrapper = mountForm()
    await findAddress(wrapper, 'Albert')

    const choices = wrapper.findAll('[data-testid="geocode-other"]')
    expect(choices).toHaveLength(1)
    expect(choices[0].text()).toBe('Albert Mall, Waterloo Street')

    await choices[0].trigger('click')

    expect(wrapper.find('[data-testid="geocode-found"]').text()).toBe('Found: Albert Mall, Waterloo Street')
    expect(wrapper.text()).toContain('Picked: 1.29880, 103.85310')
  })

  // Verify "no match" gives a friendly message and no pin
  it('says so when no address matches, and leaves the pin unset', async () => {
    api.mockResolvedValue({ results: [] })
    const wrapper = mountForm()

    await findAddress(wrapper, 'zzzz nowhere')

    expect(wrapper.find('[data-testid="geocode-message"]').text()).toBe("Couldn't find that address, tap the map instead.")
    expect(wrapper.find('[data-testid="geocode-found"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('No location picked yet')
  })

  // Verify a failed lookup shows the problem and does not break the form
  it('shows the problem when the lookup fails, and the form stays usable', async () => {
    api.mockRejectedValue(new Error("Address lookup isn't working right now. Tap the map instead."))
    const wrapper = mountForm()

    await findAddress(wrapper, '180270')

    expect(wrapper.find('[data-testid="geocode-message"]').text()).toContain("isn't working right now")
    expect(wrapper.find('[data-testid="find-on-map"]').attributes('disabled')).toBeUndefined()   // can try again
  })

  // Verify the button waits for an address (conditional state)
  it('keeps "Find on map" off until an address is typed', async () => {
    const wrapper = mountForm()
    const button = wrapper.find('[data-testid="find-on-map"]')
    expect(button.attributes('disabled')).toBeDefined()

    await wrapper.find('#g-addr').setValue('180270')
    expect(button.attributes('disabled')).toBeUndefined()

    await wrapper.find('#g-addr').setValue('   ')
    expect(button.attributes('disabled')).toBeDefined()
  })
})
