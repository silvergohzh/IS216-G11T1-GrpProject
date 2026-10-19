
import { db } from '../firebase.js'
import { processVerifiedCrowdReport } from './crowdReportRewards.js'

// Recover points for reports that were verified
// but whose reward processing may have been interrupted.
//
// Safe to rerun because rewardCrowdReport uses a unique
// event ID for each report.

export async function recoverCrowdReportRewards() {
  const snapshot = await db
    .collection('crowdReports')
    .where('verificationStatus', '==', 'verified')
    .get()

  let checked = 0
  let recovered = 0
  let failed = 0

  for (const doc of snapshot.docs) {
    const report = doc.data()

    // Only process reports with a recorded decision.
    if (typeof report.valid !== 'boolean') {
      continue
    }

    checked++

    try {
      const result = await processVerifiedCrowdReport(
        doc.id,
        report.valid
      )

      if (result.reward?.awarded === true) {
        recovered++
      }
    } catch (error) {
      failed++
      console.error(
        `[Crowd Reports] Failed to recover ${doc.id}:`,
        error
      )
    }
  }

  console.log(
    `[Crowd Reports] Recovery complete: ${checked} checked, ` +
    `${recovered} recovered, ${failed} failed`
  )

  return { checked, recovered, failed }
}
