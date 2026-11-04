/* QueueLessView.spec.js  Owner: M4 (Jon)
 Type: Component test (one Vue page in a pretend browser, with Firestore and the router faked)
 Component tests for QueueLessView.vue (the list of places with their wait and crowd level).
 Run: npm run test:vitest   (from ChopeLess/client)

 Test setup:
   - listPlaces is faked, so no Firestore is needed
   - RouterLink is replaced with a plain <a>, so no router is needed
   - the clock is fixed at 6:34 pm Singapore time on 4 Nov, so "as of" times are predictable
*/
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listPlaces } from '../../services/places'
import QueueLessView from '../QueueLessView.vue'

vi.mock('../../services/places', () => ({ listPlaces: vi.fn() }))

const NOW = new Date(Date.UTC(2026, 10, 4, 10, 34)) // 4 Nov, 6:34 pm in Singapore

const places = [
  { id: 'albert', name: 'Albert Centre', latest: { waitMins: 12, seatOccupancy: 80, at: '2026-11-04T10:32:00Z' } },
  { id: 'bras-basah', name: 'Bras Basah Complex', latest: { waitMins: 4, seatOccupancy: 24, at: '2026-11-03T14:34:00Z' } },
  { id: 'waterloo', name: 'Waterloo Centre', latest: { waitMins: 8, seatOccupancy: 48, at: '2026-11-04T09:00:00Z' } },
  { id: 'new-stall', name: 'New Stall' } // no estimate yet
]

async function mountList() {
  listPlaces.mockResolvedValue(places)
  const wrapper = mount(QueueLessView, {
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } }
  })
  await flushPromises() // wait for listPlaces
  return wrapper
}
const rows = wrapper => wrapper.findAll('[data-testid="place-row"]')

describe('QueueLessView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => { vi.useRealTimers() })

  // Verify the default sort is shortest wait first, with places that have no estimate last
  it('Test1: lists places by shortest wait, unknown waits last', async () => {
    const wrapper = await mountList()
    expect(rows(wrapper).map(r => r.find('h2').text()))
      .toEqual(['Bras Basah Complex', 'Waterloo Centre', 'Albert Centre', 'New Stall'])
  })

  // Verify switching the sort to Name puts them A to Z
  it('Test2: can sort by name instead', async () => {
    const wrapper = await mountList()
    await wrapper.find('[data-testid="sort"]').setValue('name')
    expect(rows(wrapper).map(r => r.find('h2').text()))
      .toEqual(['Albert Centre', 'Bras Basah Complex', 'New Stall', 'Waterloo Centre'])
  })

  // Verify each row shows the right crowd word for its % of seats taken
  it('Test3: shows Quiet, Busy or Packed from the seats taken', async () => {
    const wrapper = await mountList()
    const [brasBasah, waterloo, albert] = rows(wrapper)
    expect(brasBasah.text()).toContain('Quiet')  // 24%
    expect(waterloo.text()).toContain('Busy')    // 48%
    expect(albert.text()).toContain('Packed')    // 80%
  })

  // Verify "as of" shows just the time for today, and adds the date for an older estimate
  it('Test4: says when each estimate is from', async () => {
    const wrapper = await mountList()
    const [brasBasah, , albert] = rows(wrapper)
    expect(albert.text()).toContain('80% seats taken as of 6:32 pm')
    expect(brasBasah.text()).toContain('24% seats taken as of 3 Nov, 10:34 pm')
  })

  // Verify a place with no estimate shows "?" and no "as of", and each row links to its place page
  it('Test5: handles a place with no estimate and links to the place page', async () => {
    const wrapper = await mountList()
    const newStall = rows(wrapper)[3]
    expect(newStall.text()).toContain('?% seats taken')
    expect(newStall.text()).not.toContain('as of')
    expect(newStall.attributes('href')).toBe('/places/new-stall')
  })
})
