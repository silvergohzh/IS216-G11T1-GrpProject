
import { db } from '../firebase.js'
import { processVerifiedCrowdReport } from './crowdReportRewards.js'

function fail(status, message) {
  return Object.assign(new Error(message), { status })
}

// Trusted backend operation.
// The verification decision must come from a trusted reviewer
// or verification process, never from the report submitter.
export async function verifyCrowdReport({
  reportId,
  valid,
  verifiedBy
}) {
  if (
    typeof reportId !== 'string' ||
    !reportId.trim() ||
    reportId.includes('/')
  ) {
    throw fail(400, 'Invalid report ID')
  }

  if (typeof valid !== 'boolean') {
    throw fail(400, 'Verification result must be true or false')
  }

  if (
    typeof verifiedBy !== 'string' ||
    !verifiedBy.trim()
  ) {
    throw fail(400, 'Verifier identity required')
  }

  const reportRef = db.collection('crowdReports').doc(reportId)

  // A transaction prevents two reviewers from making
  // conflicting verification decisions.
  await db.runTransaction(async tx => {
    const snapshot = await tx.get(reportRef)

    if (!snapshot.exists) {
      throw fail(404, 'Crowd report not found')
    }

    const report = snapshot.data()
    if (report.uid === verifiedBy) {
  throw fail(403, 'You cannot verify your own crowd report')
}

    if (report.verificationStatus === 'verified') {
      if (report.valid !== valid) {
        throw fail(409, 'Report already verified with a different result')
      }

      return
    }

    if (report.verificationStatus !== 'pending') {
      throw fail(409, 'Report is not pending verification')
    }

    tx.update(reportRef, {
      verificationStatus: 'verified',
      valid,
      verifiedBy,
      verifiedAt: Date.now()
    })
  })

  // Reward processing is idempotent: the same report
  // cannot create multiple point awards.
  const result = await processVerifiedCrowdReport(reportId, valid)

  return {
    reportId,
    valid,
    reward: result.reward
  }
}
