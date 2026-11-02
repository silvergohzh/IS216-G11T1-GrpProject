/* GachaTie.spec.js  Owner: M3 (Silver)
 Component tests for GachaTie.vue (the "Chope-Pon" capsule machine shown when places tie).
 The SERVER already picked the winner; this component only animates it. It receives:
   - candidates: the tied places [{ id, name }]
   - winnerId:   the id the server picked
 and it:
   1. Lists every tied place with a number
   2. Runs by itself: turning -> capsule drops -> opens -> shows the server's winner
   3. Emits 'done' when the animation is finished, so WinnerView can show the winner page
   4. Lets the user tap the crank to start straight away (and only once)
 The animation uses timers (setTimeout), so we use Vitest's fake timers to "fast-forward" time
 instead of really waiting ~5 seconds.
*/
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import GachaTie from '../GachaTie.vue'

const candidates = [
  { id: 'albert-centre', name: 'Albert Centre' },
  { id: 'bens-laksa', name: "Ben's Laksa" },
  { id: 'lau-pa-sat', name: 'Lau Pa Sat' }
]

describe('GachaTie', () => {
  beforeEach(() => { vi.useFakeTimers() })   // control time ourselves
  afterEach(() => { vi.useRealTimers() })

  // Verify every tied place is listed, numbered 1, 2, 3 to match the capsules
  it('lists every tied place with a number', () => {
    const wrapper = mount(GachaTie, { props: { candidates, winnerId: 'bens-laksa' } })

    const rows = wrapper.findAll('ol li')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('1')
    expect(rows[0].text()).toContain('Albert Centre')
    expect(rows[2].text()).toContain('Lau Pa Sat')
  })

  // Verify that, without any taps, the machine reveals the place the SERVER picked
  it("runs by itself and reveals the server's pick", async () => {
    const wrapper = mount(GachaTie, { props: { candidates, winnerId: 'bens-laksa' } })
    expect(wrapper.text()).toContain('Turn the crank!')

    await vi.advanceTimersByTimeAsync(700 + 1300 + 1100 + 450)   // turning, drop, open

    expect(wrapper.text()).toContain("Ben's Laksa it is!")
    expect(wrapper.text()).toContain('CAPSULE 2')                  // Ben's Laksa is number 2 in the list
  })

  // Verify the component tells its parent it has finished (emitted event), but only at the end
  it("emits 'done' once the winner has been shown", async () => {
    const wrapper = mount(GachaTie, { props: { candidates, winnerId: 'lau-pa-sat' } })

    await vi.advanceTimersByTimeAsync(700 + 1300 + 1100 + 450)
    expect(wrapper.text()).toContain('Lau Pa Sat it is!')
    expect(wrapper.emitted('done')).toBeFalsy()                    // not yet: the result is still on screen

    await vi.advanceTimersByTimeAsync(1600)
    expect(wrapper.emitted('done')).toHaveLength(1)                // exactly once
  })

  // Verify a user can tap the crank to start immediately, and can't start it twice
  it('starts when the crank is tapped, and the crank then locks', async () => {
    const wrapper = mount(GachaTie, { props: { candidates, winnerId: 'albert-centre' } })
    const crank = wrapper.find('button[aria-label="Turn the crank"]')

    await crank.trigger('click')
    expect(wrapper.text()).toContain('Shaking it up…')
    expect(crank.attributes('disabled')).toBeDefined()
  })
})