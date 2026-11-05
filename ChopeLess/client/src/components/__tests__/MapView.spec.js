/* MapView.spec.js  Owner: M2 (Nawaz)
 Component tests for MapView.vue (the Leaflet map used for the meeting point, the Hidden Gems picker and the winner route).
 The component receives markers and a route via props and:
   1. Draws a "Start point" or "Finish line" badge for markers that have icon: 'start' or 'finish'
   2. Draws a plain dot for markers without an icon
   3. Updates the map when the markers prop changes
   4. Tells the parent when the user clicks the map, by emitting 'pick' with { lat, lng }
 We use the real Leaflet in jsdom (a pretend browser). It cannot load map tiles or measure sizes, which is fine:
 we only check what the user would see on the map (the badges) and what the parent receives (the event).
*/
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import L from 'leaflet'
import MapView from '../MapView.vue'

// jsdom cannot tell Leaflet that it can draw SVG shapes (the plain dots and the route line are SVG),
// so we tell it. Real browsers support SVG; this only helps the pretend browser.
beforeAll(() => { L.Browser.svg = true })

const start = { lat: 1.2966, lng: 103.8502, icon: 'start', label: 'Meeting point' }
const finish = { lat: 1.2995, lng: 103.8545, icon: 'finish', label: 'Albert Centre' }
const dot = { lat: 1.3, lng: 103.85, label: 'Selected spot' }

let wrapper
// Mount into the page (attachTo) so Leaflet can find its element, and clean up after each test
function mountMap(props) {
  wrapper = mount(MapView, { props, attachTo: document.body })
  return wrapper
}
afterEach(() => wrapper?.unmount())

describe('MapView', () => {

  // Verify a start marker shows the person badge and a finish marker shows the flag badge
  it('shows a Start point badge and a Finish line badge for start and finish markers', () => {
    mountMap({ markers: [start, finish] })

    expect(wrapper.find('[aria-label="Start point"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Finish line"]').exists()).toBe(true)
  })

  // Verify a marker with no icon is a plain dot, so there are no badges
  it('shows no badges for a marker without an icon', () => {
    mountMap({ markers: [dot] })

    expect(wrapper.find('[aria-label="Start point"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Finish line"]').exists()).toBe(false)
  })

  // Verify the map follows the markers prop (props change, conditional rendering)
  it('adds and removes a badge when the markers prop changes', async () => {
    mountMap({ markers: [start] })
    expect(wrapper.find('[aria-label="Finish line"]').exists()).toBe(false)

    await wrapper.setProps({ markers: [start, finish] })
    expect(wrapper.find('[aria-label="Finish line"]').exists()).toBe(true)

    await wrapper.setProps({ markers: [finish] })
    expect(wrapper.find('[aria-label="Start point"]').exists()).toBe(false)
  })

  // Verify the parent is told where the user clicked (emitted event)
  it('emits pick with a latitude and longitude when the map is clicked', async () => {
    mountMap({ markers: [] })

    await wrapper.find('[data-testid="map"]').trigger('click', { clientX: 10, clientY: 10 })

    expect(wrapper.emitted('pick')).toHaveLength(1)
    const { lat, lng } = wrapper.emitted('pick')[0][0]
    expect(typeof lat).toBe('number')
    expect(typeof lng).toBe('number')
  })
})
