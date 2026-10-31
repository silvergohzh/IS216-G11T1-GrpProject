/* today.spec.js  Owner: M3 (Silver)
 Unit test for dateSG() in ../today.js.
 dateSG(ms) turns a moment in time into Singapore's date, e.g. "2026-10-28".
 The island ticks and Today's Quests use it to reset at SINGAPORE midnight,
 so the important thing to check is the boundary: Singapore is 8 hours ahead of UTC,
 so 16:00 UTC is already midnight (the next day) in Singapore.
*/
import { describe, it, expect } from 'vitest'
import { dateSG } from '../today.js'

describe('dateSG', () => {

  // Verify the date is written as YYYY-MM-DD (10 characters, with dashes)
  it('Test1: formats the date as YYYY-MM-DD', () => {
    const result = dateSG(Date.UTC(2026, 9, 28, 4, 0))   // 28 Oct 2026, 12:00 noon in Singapore
    expect(result).toBe('2026-10-28')
    expect(result).toHaveLength(10)
  })

  // Verify one minute BEFORE Singapore midnight is still the same day
  it('Test2: 11:59pm in Singapore is still the same day', () => {
    expect(dateSG(Date.UTC(2026, 9, 28, 15, 59))).toBe('2026-10-28')
  })

  // Verify Singapore midnight counts as the NEXT day, even though it is still the 28th in UTC
  it('Test3: midnight in Singapore is already the next day', () => {
    expect(dateSG(Date.UTC(2026, 9, 28, 16, 0))).toBe('2026-10-29')
    expect(dateSG(Date.UTC(2026, 9, 28, 16, 0))).not.toBe('2026-10-28')
  })

  // Verify the month and year roll over correctly (31 Dec -> 1 Jan)
  it('Test4: rolls over to a new month and year', () => {
    expect(dateSG(Date.UTC(2026, 11, 31, 16, 0))).toBe('2027-01-01')
  })

  // Verify that with no argument it uses the current time (so it always returns a real date)
  it('Test5: uses the current time when no time is given', () => {
    expect(dateSG()).toBe(dateSG(Date.now()))
  })
})