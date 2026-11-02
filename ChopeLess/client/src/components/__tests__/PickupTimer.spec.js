/* PickupTimer.spec.js  Owner: M6 (Myat)
 Component tests for PickupTimer.vue (the 15-minute pickup countdown on the order page and the hawker board).
 The component receives pickupBy (the pickup deadline, in milliseconds) via props and:
   1. Shows the time left as minutes:seconds, e.g. "12:34 left to collect"
   2. Counts down by itself every second
   3. Shows "Pickup time is over" once the deadline has passed
   4. Stops its timer when it is removed from the page
 Fake timers let the test set the clock and skip ahead, instead of really waiting.
*/
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import PickupTimer from '../PickupTimer.vue'

// A fixed "now", so every run gives the same result
const NOW = new Date('2026-11-02T12:00:00+08:00').getTime()

describe('PickupTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // Verify the time left is shown as minutes:seconds
  it('shows the time left as minutes and seconds', () => {
    const wrapper = mount(PickupTimer, { props: { pickupBy: NOW + 754 * 1000 } }) // 754 s = 12 min 34 s

    expect(wrapper.find('[data-testid="pickup-timer"]').text()).toBe('12:34 left to collect')
  })

  // Verify single-digit seconds get a leading zero ("1:05", not "1:5")
  it('pads the seconds with a zero', () => {
    const wrapper = mount(PickupTimer, { props: { pickupBy: NOW + 65 * 1000 } })

    expect(wrapper.text()).toBe('1:05 left to collect')
  })

  // Verify the countdown goes down by itself every second
  it('counts down every second', async () => {
    const wrapper = mount(PickupTimer, { props: { pickupBy: NOW + 15 * 60 * 1000 } })
    expect(wrapper.text()).toBe('15:00 left to collect')

    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.text()).toBe('14:59 left to collect')

    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(wrapper.text()).toBe('13:59 left to collect')
  })

  // Verify it switches to the late message when the time runs out, and never shows a negative time
  it('shows that pickup time is over once the deadline passes', async () => {
    const wrapper = mount(PickupTimer, { props: { pickupBy: NOW + 2000 } })
    expect(wrapper.text()).toBe('0:02 left to collect')

    await vi.advanceTimersByTimeAsync(5000)
    const timer = wrapper.find('[data-testid="pickup-timer"]')
    expect(timer.text()).toBe('Pickup time is over. Please collect it now!')
    expect(timer.classes()).toContain('text-red-600')
    expect(wrapper.text()).not.toContain('-')
  })

  // Verify a new deadline from the parent (e.g. the order updates live) changes the countdown
  it('updates when the deadline prop changes', async () => {
    const wrapper = mount(PickupTimer, { props: { pickupBy: NOW - 1000 } })
    expect(wrapper.text()).toContain('Pickup time is over')

    await wrapper.setProps({ pickupBy: NOW + 90 * 1000 })
    await nextTick()
    expect(wrapper.text()).toBe('1:30 left to collect')
  })

  // Verify the every-second timer is stopped when the component leaves the page
  it('stops its timer when removed', () => {
    const wrapper = mount(PickupTimer, { props: { pickupBy: NOW + 60 * 1000 } })
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
