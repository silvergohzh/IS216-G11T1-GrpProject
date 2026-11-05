
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import MakanPoints from '../MakanPoints.vue'

// Mock the logged-in user
vi.mock('../../stores/auth', () => ({
  useAuthStore: () => ({
    isLoggedIn: true,
    user: {
      uid: 'janani123'
    }
  })
}))

// Mock Firebase authentication
vi.mock('../../lib/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('test-token')
    }
  }
}))

// Mock child components so we test only MakanPoints.vue
const ChildStub = defineComponent({
  template: '<div />'
})

const sampleAccount = {
  balance: 180,
  lifetimePoints: 220,
  priorityEligible: true,
  badges: ['bronze', 'silver']
}

const sampleLeaderboard = {
  leaderboard: [
    { uid: 'alice123', name: 'Alice', rank: 1, points: 200 },
    { uid: 'janani123', name: 'Janani', rank: 2, points: 150 }
  ]
}

function mountComponent() {
  return mount(MakanPoints, {
    global: {
      stubs: {
        PointsHistory: ChildStub,
        CrowdReports: ChildStub,
        CrowdReportVerifier: ChildStub
      }
    }
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url) => ({
    ok: true,
    json: async () =>
      String(url).endsWith('/leaderboard')
        ? sampleLeaderboard
        : sampleAccount
  })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Makan Points component', () => {
  it('displays the correct balance and lifetime points', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('180')
    expect(wrapper.text()).toContain('220')
    expect(wrapper.text()).toContain('Your current points balance')
  })

  it('shows priority eligibility based on points balance', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('PRIORITY PICKUP')
    expect(wrapper.text()).toContain('Eligible')
    expect(wrapper.text()).toContain(
      'You have reached the required points balance.'
    )
  })

  it('displays unlocked and locked badges correctly', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const text = wrapper.text()

    expect(text).toContain('Bronze')
    expect(text).toContain('Silver')
    expect(text).toContain('Gold')

    expect(text.match(/Unlocked/g)).toHaveLength(2)
    expect(text).toContain('80 pts to go')
  })

  it('displays the weekly leaderboard and highlights the current user', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toMatch(/Janani\s+\(you\)/)
    expect(wrapper.text()).toContain('200 pts')
    expect(wrapper.text()).toContain('150 pts')
  })

  it('fetches account and leaderboard data with an authentication token', async () => {
    mountComponent()
    await flushPromises()

    expect(fetch).toHaveBeenCalledTimes(2)

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/points/me'),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token'
        }
      })
    )

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/points/leaderboard'),
      expect.any(Object)
    )
  })
})
