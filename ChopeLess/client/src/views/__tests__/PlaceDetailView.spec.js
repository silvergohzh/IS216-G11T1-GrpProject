/* PlaceDetailView.spec.js  Owner: M4 (Jon)
 Type: Component test (one Vue page in a pretend browser, with the server, Firestore and router faked)
 Component tests for PlaceDetailView.vue (one place: Average Wait Time, the hourly chart and See Live Queue).
 Run: npm run test:vitest   (from ChopeLess/client)

 Test setup:
   - the places service is faked, so no Firestore or server is needed
   - the clock is fixed at 12:30 pm Singapore time, so "now" is always the 12pm bar
   - vue-router, Today's Quests and the Hidden Gem menu are replaced with stand-ins
*/
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getPlace, checkLiveQueue } from '../../services/places'
import PlaceDetailView from '../PlaceDetailView.vue'

vi.mock('../../services/places', () => ({
  getPlace: vi.fn(),
  analysePhoto: vi.fn(),
  shrinkPhoto: vi.fn(),
  checkLiveQueue: vi.fn(),
  livePhotoUrl: name => `http://api.test/live-photos/${name}`
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'albert-centre' } }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() })
}))
vi.mock('../../lib/firebase', () => ({ auth: { currentUser: null } }))
vi.mock('../../lib/quests', () => ({ markQuest: vi.fn() }))

// 12:30 pm in Singapore = 04:30 UTC
const NOON_SG = new Date(Date.UTC(2026, 10, 4, 4, 30))

// A place with three hours of history; 12pm is the busy lunch hour
const place = {
  id: 'albert-centre', name: 'Albert Centre', address: '270 Queen St',
  latest: { waitMins: 3, seatOccupancy: 20, peopleInQueue: 4, confidence: 'medium', at: NOON_SG.toISOString() },
  trend: [
    { hour: 11, avgWait: 10, avgSeats: 50, avgPeople: 12, reports: 1 },
    { hour: 12, avgWait: 20, avgSeats: 80, avgPeople: 25, reports: 2 },
    { hour: 14, avgWait: 4, avgSeats: 30, avgPeople: 5, reports: 1 }
  ]
}

async function mountPage(data = place) {
  getPlace.mockResolvedValue(data)
  const wrapper = mount(PlaceDetailView, { global: { stubs: { GemMenu: true } } })
  await flushPromises() // wait for getPlace
  return wrapper
}

describe('PlaceDetailView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }) // only fake the clock, so promises still resolve
    vi.setSystemTime(NOON_SG)
    vi.clearAllMocks()
  })
  afterEach(() => { vi.useRealTimers() })

  // Verify Average Wait Time shows the current hour's average (12pm), not the single latest photo
  it('Test1: Average Wait Time matches the current hour on the chart', async () => {
    const wrapper = await mountPage()
    const card = wrapper.find('[data-testid="latest"]')

    expect(card.text()).toContain('Average Wait Time')
    expect(card.text()).toContain('~20')
    expect(card.text()).toContain('80%')
    expect(card.text()).toContain('25')
    expect(card.text()).toContain('Average of 2 reports this hour')
  })

  // Verify the current hour's bar says "Now" and is coloured by how busy it is (80% seats = Packed = red)
  it('Test2: labels the current hour "Now" and colours it by crowd level', async () => {
    const wrapper = await mountPage()
    const bars = wrapper.findAll('[data-testid="hour-bar"]')

    expect(bars).toHaveLength(3)
    expect(bars[1].find('[data-testid="now-label"]').text()).toBe('Now')
    expect(bars[1].find('div').classes()).toContain('bg-red-500')
    expect(bars[0].find('div').classes()).toContain('bg-blue-700') // other hours stay blue
    expect(bars[0].text()).toBe('11')
  })

  // Verify tapping a bar shows that hour's stats, and tapping it again hides them
  it('Test3: tapping a bar opens and closes that hour\'s stats', async () => {
    const wrapper = await mountPage()
    const elevenAm = wrapper.findAll('[data-testid="hour-bar"]')[0]

    await elevenAm.trigger('click')
    const stats = wrapper.find('[data-testid="hour-stats"]')
    expect(stats.text()).toContain('11am to 12pm')
    expect(stats.text()).toContain('~10')
    expect(stats.text()).toContain('50%')
    expect(stats.text()).toContain('Average of 1 report')
    expect(elevenAm.attributes('aria-pressed')).toBe('true')

    await elevenAm.trigger('click')
    expect(wrapper.find('[data-testid="hour-stats"]').exists()).toBe(false)
  })

  // Verify "Best time to go" picks the hour with the shortest average wait
  it('Test4: shows the quietest hour as the best time to go', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="best-time"]').text()).toContain('2pm (about 4 min)')
  })

  // Verify a place with no history explains why there is no chart
  it('Test5: says there is no hourly data yet for a new place', async () => {
    const wrapper = await mountPage({ ...place, latest: null, trend: [] })

    expect(wrapper.find('[data-testid="no-trend"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hour-bar"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('No estimate yet')
  })

  // Verify See Live Queue shows the AI's estimate and the photo it used
  it('Test6: See Live Queue shows the live estimate and photo', async () => {
    const wrapper = await mountPage()
    checkLiveQueue.mockResolvedValue({ peopleInQueue: 3, waitMins: 6, seatOccupancy: 80, confidence: 'high', photo: 'busy1.jpeg' })
    // after the check, the page reloads the place, which now has the live photo
    getPlace.mockResolvedValue({ ...place, latest: { ...place.latest, photo: 'busy1.jpeg' } })

    await wrapper.find('[data-testid="live-btn"]').trigger('click')
    await flushPromises()

    expect(checkLiveQueue).toHaveBeenCalledWith('albert-centre')
    expect(wrapper.find('[data-testid="live-result"]').text())
      .toContain('we estimate 3 people in the queue, about 6 min wait, and 80% of seats taken (high confidence)')
    expect(wrapper.find('[data-testid="live-photo"]').attributes('src')).toBe('http://api.test/live-photos/busy1.jpeg')
  })

  // Verify a failed live check shows the error and no estimate
  it('Test7: shows the error when the live check fails', async () => {
    const wrapper = await mountPage()
    checkLiveQueue.mockRejectedValue(new Error('Too many checks, please try again in a few minutes'))

    await wrapper.find('[data-testid="live-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.error').text()).toBe('Too many checks, please try again in a few minutes')
    expect(wrapper.find('[data-testid="live-result"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="live-btn"]').attributes('disabled')).toBeUndefined() // can try again
  })
})
