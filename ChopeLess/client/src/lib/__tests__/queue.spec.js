/* queue.spec.js  Owner: M4 (Jon)
 Unit tests for the QueueLess helpers in ../queue.js.
 Run: npm run test:vitest   (from ChopeLess/client)

 hourlyTrend(records) -> one entry per hour with the average wait, queue and seats, and how many reports
 crowdLevel(seats)    -> 'Quiet' under 45%, 'Busy' from 45%, 'Packed' from 75%
 asOf(iso, now)       -> "6:32 pm" for today, "3 Nov, 6:32 pm" for an earlier day (Singapore time)
*/
import { describe, it, expect } from 'vitest'
import { hourlyTrend, crowdLevel, asOf } from '../queue.js'

describe('hourlyTrend', () => {

  // Verify two reports in the same hour are averaged, and the count says how many there were
  it('Test1: averages the reports in the same hour', () => {
    const trend = hourlyTrend([
      { hour: 12, waitMins: 10, peopleInQueue: 12, seatOccupancy: 80 },
      { hour: 12, waitMins: 20, peopleInQueue: 24, seatOccupancy: 100 }
    ])
    expect(trend).toEqual([{ hour: 12, avgWait: 15, avgPeople: 18, avgSeats: 90, reports: 2 }])
  })

  // Verify hours come out in order (8, 9, ... 21) even when the reports arrive mixed up
  it('Test2: sorts the hours from earliest to latest', () => {
    const trend = hourlyTrend([
      { hour: 19, waitMins: 5, peopleInQueue: 6, seatOccupancy: 50 },
      { hour: 8, waitMins: 3, peopleInQueue: 4, seatOccupancy: 20 },
      { hour: 12, waitMins: 9, peopleInQueue: 11, seatOccupancy: 70 }
    ])
    expect(trend.map(t => t.hour)).toEqual([8, 12, 19])
  })

  // Verify a single report is used as-is (an average of one)
  it('Test3: keeps a single report as its own average', () => {
    const [t] = hourlyTrend([{ hour: 10, waitMins: 7, peopleInQueue: 9, seatOccupancy: 33 }])
    expect(t).toEqual({ hour: 10, avgWait: 7, avgPeople: 9, avgSeats: 33, reports: 1 })
  })

  // Verify a place with no reports gets an empty chart, not an error
  it('Test4: returns an empty list when there are no reports', () => {
    expect(hourlyTrend([])).toEqual([])
  })
})

describe('crowdLevel', () => {

  // Verify the boundaries: 44% is still Quiet, 45% is Busy, 74% is still Busy, 75% is Packed
  it('Test5: switches level exactly at 45% and 75%', () => {
    expect(crowdLevel(0)).toBe('Quiet')
    expect(crowdLevel(44)).toBe('Quiet')
    expect(crowdLevel(45)).toBe('Busy')
    expect(crowdLevel(74)).toBe('Busy')
    expect(crowdLevel(75)).toBe('Packed')
    expect(crowdLevel(100)).toBe('Packed')
  })

  // Verify a place with no estimate yet counts as Quiet instead of crashing
  it('Test6: treats a missing estimate as Quiet', () => {
    expect(crowdLevel(undefined)).toBe('Quiet')
    expect(crowdLevel(null)).toBe('Quiet')
  })
})

describe('asOf', () => {

  // "Now" for these tests: 4 Nov 2026, 6:34 pm in Singapore (10:34 UTC)
  const now = Date.UTC(2026, 10, 4, 10, 34)

  // Verify an estimate from today only shows the time
  it('Test7: shows just the time for an estimate made today', () => {
    expect(asOf('2026-11-04T10:32:00Z', now)).toBe('6:32 pm')
  })

  // Verify an estimate from an earlier day also shows the date, so stale numbers stand out
  it('Test8: adds the date for an estimate from an earlier day', () => {
    expect(asOf('2026-11-03T14:34:00Z', now)).toBe('3 Nov, 10:34 pm')
  })

  // Verify the Singapore midnight boundary: 16:00 UTC is already the next day in Singapore
  it('Test9: uses the Singapore date, not the UTC date', () => {
    // 3 Nov 16:30 UTC = 4 Nov 12:30 am in Singapore, so it is "today" and needs no date
    expect(asOf('2026-11-03T16:30:00Z', now)).toBe('12:30 am')
  })

  // Verify no timestamp gives an empty string, so the page shows nothing instead of "Invalid Date"
  it('Test10: returns an empty string when there is no timestamp', () => {
    expect(asOf(undefined, now)).toBe('')
    expect(asOf('', now)).toBe('')
  })
})
