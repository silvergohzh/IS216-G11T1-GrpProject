// Component tests: GemMenu.vue, the community menu of a Hidden Gem. Owner: M5

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// The real service and auth store talk to Firebase. Replace them with fakes.
const mocks = vi.hoisted(() => ({
  getMenu: vi.fn(),
  addMenuItem: vi.fn(),
  auth: { isLoggedIn: true, user: { uid: 'me' } }
}))
vi.mock('../../services/gems', () => ({
  getMenu: mocks.getMenu,
  addMenuItem: mocks.addMenuItem,
  updateMenuItem: vi.fn(),
  deleteMenuItem: vi.fn(),
  addMenuPhoto: vi.fn(),
  deleteMenuPhoto: vi.fn(),
  photoToDataUrl: vi.fn()
}))
vi.mock('../../stores/auth', () => ({ useAuthStore: () => mocks.auth }))

import GemMenu from '../GemMenu.vue'

const GEM = 'ba-buong-banh-mi'

beforeEach(() => {
  mocks.getMenu.mockReset()
  mocks.getMenu.mockResolvedValue({
    items: [{ id: 'd1', name: 'Banh mi special', price: 6.5, addedBy: 'alice-uid', addedByName: 'alice' }],
    photos: []
  })
  mocks.addMenuItem.mockReset()
  mocks.auth.isLoggedIn = true
  mocks.auth.user = { uid: 'me' }
})

describe('GemMenu', () => {
  it('shows the accuracy disclaimer and the community dishes, with no editing for a visitor', async () => {
    mocks.auth.isLoggedIn = false
    mocks.auth.user = null

    const wrapper = mount(GemMenu, { props: { gemId: GEM } })
    await flushPromises()

    expect(wrapper.text()).toContain('subject to accuracy')
    expect(wrapper.text()).toContain('Banh mi special')
    expect(wrapper.text()).toContain('$6.50')
    expect(wrapper.text()).toContain('added by alice')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('lets a logged-in contributor add a dish and shows the Makan Points reward', async () => {
    mocks.addMenuItem.mockResolvedValue({ id: 'new', pointsAwarded: 30 })

    const wrapper = mount(GemMenu, { props: { gemId: GEM, editable: true } })
    await flushPromises()

    await wrapper.find(`#mi-name-${GEM}`).setValue('Chilli crab bao')
    await wrapper.find(`#mi-price-${GEM}`).setValue('7.5')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mocks.addMenuItem).toHaveBeenCalledTimes(1)
    const [gemId, dish] = mocks.addMenuItem.mock.calls[0]
    expect(gemId).toBe(GEM)
    expect(dish.name).toBe('Chilli crab bao')
    expect(Number(dish.price)).toBe(7.5)
    expect(wrapper.text()).toContain('+30 Makan Points')
  })
})