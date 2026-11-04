/* walkingTime.spec.js  Owner: M2 (Nawaz)
 Unit tests for the walking-time functions in server/services/osrm.js (the ones the shortlist uses).
 Run: npm run test:vitest   (from ChopeLess/client)

 The functions normally ask the public OSRM server for the street route. For a unit test we want the same
 answer every run and no internet, so we switch on OSRM_OFFLINE. The functions then always use the
 straight-line estimate: distance / 5 km/h, plus 30% because streets are not straight.

 walkingMinutes(from, to) -> whole minutes
 walkingRoute(from, to)   -> [[lat, lng], [lat, lng]]  (the order Leaflet wants)
*/
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { walkingMinutes, walkingRoute } from '../../../../server/services/osrm.js'

// Real places, so the numbers mean something
const smu = { lat: 1.2966, lng: 103.8502 }
const albertCentre = { lat: 1.2995, lng: 103.8545 }
const farAway = { lat: 1.3521, lng: 103.8198 }   // roughly Toa Payoh

let oldSetting
beforeAll(() => {
  oldSetting = process.env.OSRM_OFFLINE
  process.env.OSRM_OFFLINE = 'true'
})
afterAll(() => {
  if (oldSetting === undefined) delete process.env.OSRM_OFFLINE
  else process.env.OSRM_OFFLINE = oldSetting
})

describe('TestSuite: walkingMinutes (offline estimate)', () => {
  it('Test1: the same point is 0 minutes away', async () => {
    expect(await walkingMinutes(smu, smu)).toBe(0)
  })

  it('Test2: SMU to Albert Centre is 9 minutes', async () => {
    expect(await walkingMinutes(smu, albertCentre)).toBe(9)
  })

  it('Test3: 0.01 degrees of latitude (about 1.1 km) is 17 minutes', async () => {
    expect(await walkingMinutes(smu, { lat: smu.lat + 0.01, lng: smu.lng })).toBe(17)
  })

  it('Test4: the time is the same in both directions', async () => {
    const there = await walkingMinutes(smu, albertCentre)
    const back = await walkingMinutes(albertCentre, smu)
    expect(there).toBe(back)
  })

  it('Test5: a place further away takes longer', async () => {
    const near = await walkingMinutes(smu, albertCentre)
    const far = await walkingMinutes(smu, farAway)
    expect(far > near).toBe(true)
  })

  it('Test6: the answer is a whole number of minutes', async () => {
    const minutes = await walkingMinutes(smu, farAway)
    expect(Number.isInteger(minutes)).toBe(true)
  })

  it('Test7: offline mode never calls the internet', async () => {
    const fakeFetch = vi.fn()
    vi.stubGlobal('fetch', fakeFetch)
    await walkingMinutes(smu, albertCentre)
    await walkingRoute(smu, albertCentre)
    vi.unstubAllGlobals()
    expect(fakeFetch).not.toHaveBeenCalled()
  })
})

describe('TestSuite: walkingRoute (offline straight line)', () => {
  it('Test1: gives a start point and an end point, as [lat, lng]', async () => {
    const route = await walkingRoute(smu, albertCentre)
    expect(route).toHaveLength(2)
    expect(route).toEqual([[1.2966, 103.8502], [1.2995, 103.8545]])
  })

  it('Test2: the first point is where we start, the last is where we end', async () => {
    const route = await walkingRoute(smu, farAway)
    expect(route[0]).toEqual([smu.lat, smu.lng])
    expect(route[route.length - 1]).toEqual([farAway.lat, farAway.lng])
  })
})
