
import { test, expect } from '@playwright/test'
import {
  newPerson,
  openLobby,
  startVotingNoTimer
} from './session-helpers.js'
import { signUp } from './helpers.js'

test('Makan Points: completing a session rewards the host and guest', async ({ browser }) => {
  test.setTimeout(120_000)

  const host = await newPerson(browser)
  const guest = await newPerson(browser)

  // Create a new Makan Session with two fresh accounts.
  const code = await openLobby(host, guest)
  await startVotingNoTimer(host, guest)

  // Both agree on the first restaurant: immediate winner.
  await host.getByTestId('vote-yes').click()
  await guest.getByTestId('vote-yes').click()

  await expect(host.getByTestId('winner-name')).toBeVisible({
    timeout: 30000
  })
  await expect(guest.getByTestId('winner-name')).toBeVisible({
    timeout: 30000
  })

  // Check points and history through the actual Makan Points UI.
  await host.goto('/points')
  await guest.goto('/points')

  const hostBalance = host.locator('.card-navy .text-6xl')
  const guestBalance = guest.locator('.card-navy .text-6xl')

  await expect(hostBalance).toHaveText('15', { timeout: 30000 })
  await expect(guestBalance).toHaveText('10', { timeout: 30000 })

  // Host receives 10 completion points and 5 bonus points.
  await expect(host.getByText('Completed a Makan Session')).toBeVisible()
  await expect(host.getByText('Hosted a Makan Session')).toBeVisible()

  // Guest only receives the completion reward.
  await expect(guest.getByText('Completed a Makan Session')).toBeVisible()
  await expect(guest.getByText('Hosted a Makan Session')).toHaveCount(0)

  // Both histories should reference the same Makan Session.
  await expect(host.getByText(`Session: ${code}`).first()).toBeVisible()
  await expect(guest.getByText(`Session: ${code}`).first()).toBeVisible()
})


test('Makan Points: crowd reports award +15, deduct 10 and prevent duplicate rewards', async ({ browser, request }) => {
  test.setTimeout(120_000)

  // Create a new report submitter.
  const page = await (await browser.newContext()).newPage()
  const email = await signUp(page, 'crowd-points')

  // Log in through the Firebase Auth Emulator to obtain API tokens.
  async function getToken(userEmail) {
    const response = await request.post(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',
      {
        data: {
          email: userEmail,
          password: 'test1234',
          returnSecureToken: true
        }
      }
    )

    expect(response.ok()).toBeTruthy()
    return (await response.json()).idToken
  }

  const userToken = await getToken(email)
  const verifierToken = await getToken('crowd-verifier@chopeless.test')

  const api = 'http://localhost:3001/api'

  // Read the user's actual points from the backend.
  async function getBalance() {
    const response = await request.get(`${api}/points/me`, {
      headers: { Authorization: `Bearer ${userToken}` }
    })

    expect(response.ok()).toBeTruthy()
    return (await response.json()).balance
  }

  // Submit a report as the normal user.
  async function submitReport(placeId) {
    const response = await request.post(`${api}/crowd-reports`, {
      headers: { Authorization: `Bearer ${userToken}` },
      data: {
        placeId,
        queueMinutes: 15,
        comment: 'E2E Makan Points test'
      }
    })

    expect(response.status()).toBe(201)
    return (await response.json()).id
  }

  // Approve or reject as the authorized verifier.
  async function verifyReport(reportId, valid) {
    const response = await request.patch(
      `${api}/crowd-reports/${reportId}/verify`,
      {
        headers: { Authorization: `Bearer ${verifierToken}` },
        data: { valid }
      }
    )

    expect(response.ok()).toBeTruthy()
    return response.json()
  }

  // 1. New user starts with 0 points.
  expect(await getBalance()).toBe(0)

  // 2. Submitting alone must not award any points.
  const validReportId = await submitReport('ah-seng-chicken-rice')
  expect(await getBalance()).toBe(0)

  // 3. Approved report earns +15 points.
  await verifyReport(validReportId, true)
  expect(await getBalance()).toBe(15)

  // 4. Verifying the same report again must not reward twice.
  await verifyReport(validReportId, true)
  expect(await getBalance()).toBe(15)

  // 5. Rejecting another report deducts 10 points.
  const invalidReportId = await submitReport('waterloo-nasi-lemak')
  expect(await getBalance()).toBe(15)

  await verifyReport(invalidReportId, false)
  expect(await getBalance()).toBe(5)

  // 6. Repeating the rejection must not deduct twice.
  await verifyReport(invalidReportId, false)
  expect(await getBalance()).toBe(5)

  // 7. Both transactions appear in Makan Points history.
  const historyResponse = await request.get(`${api}/points/history`, {
    headers: { Authorization: `Bearer ${userToken}` }
  })

  expect(historyResponse.ok()).toBeTruthy()
  const historyData = await historyResponse.json()
  const entries = Array.isArray(historyData)
    ? historyData
    : historyData.entries ?? historyData.history ?? []

  expect(entries).toEqual(expect.arrayContaining([
    expect.objectContaining({
      reason: 'VERIFIED_REPORT',
      points: 15
    }),
    expect.objectContaining({
      reason: 'INVALID_REPORT',
      points: -10
    })
  ]))
})


test('Makan Points: weekly leaderboard reflects session rewards', async ({ browser, request }) => {
  test.setTimeout(120_000)

  const host = await newPerson(browser)
  const guest = await newPerson(browser)

  // Create two new users and complete a Makan Session.
  const code = await openLobby(host, guest)
  await startVotingNoTimer(host, guest)

  await host.getByTestId('vote-yes').click()
  await guest.getByTestId('vote-yes').click()

  await expect(host.getByTestId('winner-name')).toBeVisible({
    timeout: 30000
  })

  await expect(guest.getByTestId('winner-name')).toBeVisible({
    timeout: 30000
  })

  // Obtain the host and guest Firebase UIDs.
  // Each user's points should appear separately on the leaderboard.
  
async function getUser(page) {
  const user = await page.evaluate(async () => {
    const databases = await indexedDB.databases()

    for (const database of databases) {
      if (!database.name?.startsWith('firebaseLocalStorageDb')) {
        continue
      }

      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(database.name)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      try {
        const result = await new Promise((resolve, reject) => {
          const tx = db.transaction('firebaseLocalStorage', 'readonly')
          const req = tx.objectStore('firebaseLocalStorage').getAll()

          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        })

        const auth = result.find(item => item?.value?.uid)

        if (auth) {
          return {
            uid: auth.value.uid,
            email: auth.value.email
          }
        }
      } finally {
        db.close()
      }
    }

    return null
  })

  expect(user).not.toBeNull()
  expect(user.uid).toBeTruthy()
  expect(user.email).toBeTruthy()

  const response = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',
    {
      data: {
        email: user.email,
        password: 'test1234',
        returnSecureToken: true
      }
    }
  )

  expect(response.ok()).toBeTruthy()
  return response.json()
}


  const hostUser = await getUser(host)
  const guestUser = await getUser(guest)

  // Fetch the actual weekly leaderboard from the backend.
  const response = await request.get(
    'http://localhost:3001/api/points/leaderboard',
    {
      headers: {
        Authorization: `Bearer ${hostUser.idToken}`
      }
    }
  )

  expect(response.ok()).toBeTruthy()

  const data = await response.json()
  const leaderboard = Array.isArray(data)
    ? data
    : data.leaderboard ?? data.entries ?? []

  
// Host earns 10 completion points + 5 host bonus.
// Guest earns 10 completion points.
//
// The leaderboard only returns the top 20 users.
// Therefore, a user may be absent even when points
// were correctly awarded.

const hostEntry = leaderboard.find(
  entry => entry.uid === hostUser.localId
)

const guestEntry = leaderboard.find(
  entry => entry.uid === guestUser.localId
)

// Confirm rewards were correctly recorded for both users,
// regardless of whether they reached the leaderboard's top 20.
async function getPointsHistory(token) {
  const response = await request.get(
    'http://localhost:3001/api/points/history',
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )

  expect(response.ok()).toBeTruthy()

  const data = await response.json()
  return Array.isArray(data)
    ? data
    : data.entries ?? data.history ?? []
}

const hostHistory = await getPointsHistory(hostUser.idToken)
const guestHistory = await getPointsHistory(guestUser.idToken)

expect(hostHistory).toEqual(expect.arrayContaining([
  expect.objectContaining({
    reason: 'SESSION_COMPLETE',
    points: 10
  }),
  expect.objectContaining({
    reason: 'HOST_BONUS',
    points: 5
  })
]))

expect(guestHistory).toEqual(expect.arrayContaining([
  expect.objectContaining({
    reason: 'SESSION_COMPLETE',
    points: 10
  })
]))

// If the users are in the top 20, verify their weekly totals.
if (hostEntry) {
  expect(hostEntry.points).toBe(15)
}

if (guestEntry) {
  expect(guestEntry.points).toBe(10)
}

// Leaderboard must contain no more than 20 users.
expect(leaderboard.length).toBeLessThanOrEqual(20)

// Entries must be sorted by descending weekly points,
// with consecutive ranks starting at 1.
leaderboard.forEach((entry, index) => {
  expect(entry.rank).toBe(index + 1)

  if (index > 0) {
    expect(leaderboard[index - 1].points)
      .toBeGreaterThanOrEqual(entry.points)
  }
})

// If both users appear, the host should rank higher.
if (hostEntry && guestEntry) {
  expect(hostEntry.rank).toBeLessThan(guestEntry.rank)
}
})
