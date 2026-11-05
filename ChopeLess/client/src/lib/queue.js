// QueueLess helpers shared by the list, the place page and the places service. Owner: M4
// Kept free of Vue and Firestore so they can be unit tested (see __tests__/queue.spec.js).

// Average the photo reports for each hour, for the "Average wait by hour" chart
// Input: [{ hour, waitMins, peopleInQueue, seatOccupancy }, ...] (any order)
// Output: [{ hour, avgWait, avgPeople, avgSeats, reports }, ...] sorted by hour
export function hourlyTrend(records) {
  const byHour = {}
  for (const a of records) {
    byHour[a.hour] ??= { total: 0, people: 0, seats: 0, count: 0 }
    byHour[a.hour].total += a.waitMins
    byHour[a.hour].people += a.peopleInQueue
    byHour[a.hour].seats += a.seatOccupancy
    byHour[a.hour].count++
  }
  return Object.keys(byHour).map(Number).sort((a, b) => a - b)
    .map(hour => {
      const h = byHour[hour]
      return { hour, avgWait: h.total / h.count, avgPeople: h.people / h.count, avgSeats: h.seats / h.count, reports: h.count }
    })
}

// How crowded a place is from the % of seats taken
// Input: seatOccupancy (0-100, or missing)
// Output: 'Quiet' (under 45%), 'Busy' (45-74%) or 'Packed' (75% and up)
export function crowdLevel(seatOccupancy) {
  const occ = seatOccupancy ?? 0
  return occ >= 75 ? 'Packed' : occ >= 45 ? 'Busy' : 'Quiet'
}

// When an estimate was made, in Singapore time: "6:32 pm" today, or "3 Nov, 6:32 pm" on an earlier day
// Input: iso (timestamp string), now (ms, defaults to the current time; tests pass a fixed one)
// Output: string ('' when there is no timestamp)
export function asOf(iso, now = Date.now()) {
  if (!iso) return ''
  const sg = { timeZone: 'Asia/Singapore' }
  const time = new Date(iso).toLocaleTimeString('en-SG', { ...sg, hour: 'numeric', minute: '2-digit' })
  const day = d => new Date(d).toLocaleDateString('en-SG', { ...sg, day: 'numeric', month: 'short' })
  return day(iso) === day(now) ? time : `${day(iso)}, ${time}`
}
