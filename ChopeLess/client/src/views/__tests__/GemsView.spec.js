// Component tests: GemsView.vue, the Hidden Gems board. Owner: M5
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  gems: [],
  upvoteGem: vi.fn(),
  unvoteGem: vi.fn(),
  auth: { isLoggedIn: true, user: { uid: 'me' } }
}))
vi.mock('../../services/gems', () => ({
  UPVOTES_NEEDED: 3,
  // the live listener: hand over the test gems straight away
  watchGems: onChange => { onChange(mocks.gems); return () => {} },
  upvoteGem: mocks.upvoteGem,
  unvoteGem: mocks.unvoteGem,
  addGem: vi.fn(),
  updateGem: vi.fn(),
  deleteGem: vi.fn(),
  adminDeleteGem: vi.fn(),
  getReviews: vi.fn(),
  saveReview: vi.fn(),
  updateReview: vi.fn(),
  deleteReview: vi.fn(),
  photoToDataUrl: vi.fn()
}))
vi.mock('../../stores/auth', () => ({ useAuthStore: () => mocks.auth }))
// The map and the menu have their own tests. Keep them out of this one.
vi.mock('../../components/MapView.vue', () => ({ default: { render: () => null } }))
vi.mock('../../components/GemMenu.vue', () => ({ default: { render: () => null } }))

import GemsView from '../GemsView.vue'

const gem = changes => ({
  id: 'ba-buong-banh-mi',
  name: 'Ba Buông Bánh Mì',
  mustTry: 'Bánh mì',
  cuisine: 'Vietnamese',
  address: '90 Middle Rd',
  priceMin: 5,
  priceMax: 10,
  waitMins: 10,
  imageUrl: 'data:image/jpeg;base64,AAAA',
  submittedBy: 'someone-else',
  upvoters: ['a', 'b', 'c'],
  ratingSum: 12,
  ratingCount: 3,
  ...changes
})

beforeEach(() => {
  mocks.upvoteGem.mockReset()
  mocks.unvoteGem.mockReset()
  mocks.auth.isLoggedIn = true
  mocks.auth.user = { uid: 'me' }
})

describe('GemsView', () => {
  it('shows the average rating and the voting-pool label, and the accuracy disclaimer', async () => {
    mocks.gems = [
      gem(),
      gem({ id: 'new-gem', name: 'New Gem', upvoters: ['a'], ratingSum: 0, ratingCount: 0 })
    ]
    const wrapper = mount(GemsView)
    await flushPromises()   // the board fills in after the first render
    const rows = wrapper.findAll('[data-testid="gem-row"]')

    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('Ba Buông Bánh Mì')
    expect(rows[0].text()).toContain('4.0 / 5 (3 reviews)')   // 12 stars from 3 reviews
    expect(rows[0].text()).toContain('in voting pool')         // 3 upvotes
    expect(rows[1].text()).toContain('No ratings yet')
    expect(rows[1].text()).not.toContain('in voting pool')     // only 1 upvote
    expect(wrapper.text()).toContain('subject to accuracy')
  })

  it('the upvote button votes, and takes your vote back if you already voted', async () => {
    mocks.gems = [
      gem({ id: 'not-voted', name: 'Not Voted', upvoters: ['a'] }),
      gem({ id: 'voted', name: 'Voted', upvoters: ['me'] })
    ]
    const wrapper = mount(GemsView)
    await flushPromises()

    await wrapper.find('button[title="Upvote"]').trigger('click')
    await flushPromises()
    expect(mocks.upvoteGem).toHaveBeenCalledWith('not-voted')
    expect(mocks.unvoteGem).not.toHaveBeenCalled()

    await wrapper.find('button[title="Remove my upvote"]').trigger('click')
    await flushPromises()
    expect(mocks.unvoteGem).toHaveBeenCalledWith('voted')
  })
})