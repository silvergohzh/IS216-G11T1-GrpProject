/* PlaceCard.spec.js  Owner: M3 (Silver)
 Component tests for PlaceCard.vue (the card used in the swipe deck, QueueLess list and winner screen).
 The component receives a place via props and:
   1. Displays its name, cuisine, address, price range, walk time and queue time
   2. Shows "–" when the walk or queue time is unknown
   3. Shows chips only when they apply (HIDDEN GEM, outside limits, been here)
   4. Shows the place-type tag (Hawker centre, Food court, ...) only when the place has a type
   5. Shows whatever the parent puts in its slot (e.g. a button)
*/
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import PlaceCard from '../PlaceCard.vue'

// A normal place, like one from the voting shortlist
const place = {
  name: 'Albert Centre', cuisine: 'Hawker', address: '270 Queen St',
  priceMin: 4, priceMax: 8, walkMins: 6, waitMins: 12, type: 'hawker-centre'
}

describe('PlaceCard', () => {

  // Verify the main details from the prop are shown to the user
  it('displays the name, cuisine, address, price, walk and queue time', () => {
    const wrapper = mount(PlaceCard, { props: { place } })

    expect(wrapper.find('h3').text()).toBe('Albert Centre')
    expect(wrapper.text()).toContain('Hawker · 270 Queen St')
    expect(wrapper.text()).toContain('$4–8')
    expect(wrapper.text()).toContain('6 min')
    expect(wrapper.text()).toContain('12 min')
  })

  // Verify unknown times show "–", and the latest QueueLess estimate is used when there is no waitMins
  it('shows – for an unknown walk time and uses the latest queue estimate', () => {
    const wrapper = mount(PlaceCard, {
      props: { place: { name: 'Lau Pa Sat', cuisine: 'Hawker', address: '18 Raffles Quay', priceMin: 5, priceMax: 10, latest: { waitMins: 9 } } }
    })

    expect(wrapper.text()).toContain('– min')
    expect(wrapper.text()).toContain('9 min')
  })

  // Verify the chips only appear when they apply (conditional rendering, v-if)
  it('shows HIDDEN GEM, outside-limits and visit chips only when they apply', () => {
    const plain = mount(PlaceCard, { props: { place } })
    expect(plain.text()).not.toContain('HIDDEN GEM')
    expect(plain.text()).not.toContain('Slightly outside your limits')
    expect(plain.text()).not.toContain('Been here')

    const special = mount(PlaceCard, { props: { place: { ...place, isGem: true, outside: true, visits: 3 } } })
    expect(special.text()).toContain('HIDDEN GEM')
    expect(special.text()).toContain('Slightly outside your limits')
    expect(special.text()).toContain('Been here 3×')
  })

  // Verify the place-type tag shows the right words, and is hidden when the place has no type (e.g. a hidden gem)
  it('shows the place-type tag only when the place has a type', () => {
    const hawker = mount(PlaceCard, { props: { place } })
    expect(hawker.find('[data-testid="place-tag"]').text()).toBe('Hawker centre')

    const gem = mount(PlaceCard, { props: { place: { ...place, type: undefined } } })
    expect(gem.find('[data-testid="place-tag"]').exists()).toBe(false)
  })

  // Verify the slot: the parent can add its own content (e.g. the "Open" button on the QueueLess list)
  it('shows the content passed into its slot', () => {
    const wrapper = mount(PlaceCard, {
      props: { place },
      slots: { default: '<button>See stalls</button>' }
    })

    expect(wrapper.find('button').text()).toBe('See stalls')
  })
})