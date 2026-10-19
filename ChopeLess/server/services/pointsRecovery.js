
import { db } from '../firebase.js'
import { awardSessionPoints } from './points.js'

// Recover rewards for completed Makan Sessions.
//
// If the server crashed after completing a session but before
// awarding all members, this function awards any missing points.
//
// awardSessionPoints() uses unique event IDs in the ledger,
// so running this function multiple times does not award
// duplicate points.

export async function recoverSessionRewards() {
  console.log('[Makan Points] Checking completed sessions...')

  const snapshot = await db
    .collection('sessions')
    .where('status', '==', 'done')
    .get()

  let checked = 0
  let recovered = 0
  let failed = 0

  for (const doc of snapshot.docs) {
    const session = {
      ...doc.data(),
      code: doc.id
    }

    // Only completed sessions with an actual winner
    // qualify for session completion rewards.
    if (!session.winner) {
      continue
    }

    checked++

    try {
      const result = await awardSessionPoints(session)

      const newAwards = (result.results || [])
        .filter(entry => entry.awarded)

      if (newAwards.length > 0) {
        recovered += newAwards.length

        console.log(
          `[Makan Points] Recovered ${newAwards.length} reward(s) for session ${session.code}`
        )
      }
    } catch (error) {
      failed++

      console.error(
        `[Makan Points] Recovery failed for session ${session.code}:`,
        error.message
      )
    }
  }

  console.log(
    `[Makan Points] Recovery complete. ` +
    `Sessions checked: ${checked}, ` +
    `Rewards recovered: ${recovered}, ` +
    `Sessions failed: ${failed}`
  )

  return {
    checked,
    recovered,
    failed
  }
}
