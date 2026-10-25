
import { db } from '../firebase.js'
import { rewardCrowdReport } from './points.js'

const reports = db.collection('crowdReports')
const places = db.collection('places')

function fail(status, message) {
  return Object.assign(new Error(message), { status })
}

// Called only after a trusted verification process.
// Valid reports update the restaurant's latest wait time.
// Points are awarded or deducted through points.js.

export async function processVerifiedCrowdReport(reportId, valid) {
  if (
    typeof reportId !== 'string' ||
    !reportId.trim() ||
    reportId.includes('/')
  ) {
    throw fail(400, 'Invalid report ID')
  }

  if (typeof valid !== 'boolean') {
    throw fail(
      400,
      'Verification result must be true or false'
    )
  }

  const reportRef = reports.doc(reportId)
  const snapshot = await reportRef.get()

  if (!snapshot.exists) {
    throw fail(404, 'Crowd report not found')
  }

  const report = snapshot.data()

  if (!report.uid) {
    throw fail(
      400,
      'Report has no authenticated owner'
    )
  }

  if (report.verificationStatus !== 'verified') {
    throw fail(
      409,
      'Report has not completed verification'
    )
  }

  if (report.valid !== valid) {
    throw fail(
      409,
      'Verification result does not match the stored report'
    )
  }

  // =====================================================
  // VALIDATE VERIFIED REPORT DATA
  // =====================================================

  if (valid) {
    if (
      typeof report.placeId !== 'string' ||
      !report.placeId.trim() ||
      report.placeId.includes('/')
    ) {
      throw fail(400, 'Invalid restaurant ID')
    }

    if (
      !Number.isInteger(report.queueMinutes) ||
      report.queueMinutes < 0 ||
      report.queueMinutes > 240
    ) {
      throw fail(400, 'Invalid reported queue time')
    }
  }

  // =====================================================
  // UPDATE RESTAURANT WAIT TIME
  // =====================================================

  let placeUpdated = false

  if (valid) {
    const placeRef = places.doc(report.placeId)

    await db.runTransaction(async tx => {
      const placeSnap = await tx.get(placeRef)

      if (!placeSnap.exists) {
        throw fail(404, 'Restaurant not found')
      }

      const place = placeSnap.data()
      const latest = place.latest || {}

      // Use the time the report was verified.
      const verifiedAt = report.verifiedAt

      if (
        typeof verifiedAt !== 'number' ||
        !Number.isFinite(verifiedAt)
      ) {
        throw fail(400, 'Missing verification timestamp')
      }

      // Do not let an older verified report overwrite
      // a newer one.
      const previousVerifiedAt =
        typeof latest.verifiedAt === 'number'
          ? latest.verifiedAt
          : 0

      if (previousVerifiedAt > verifiedAt) {
        return
      }

      // Update only the relevant fields.
      // Preserve peopleInQueue, seatOccupancy
      // and any other existing latest data.
      tx.update(placeRef, {
        'latest.waitMins': report.queueMinutes,
        'latest.at': new Date(verifiedAt).toISOString(),
        'latest.verifiedAt': verifiedAt,
        'latest.reportId': reportId,
        'latest.source': 'verified_crowd_report'
      })

      placeUpdated = true
    })
  }

  // =====================================================
  // AWARD / DEDUCT MAKAN POINTS
  // =====================================================

  // points.js handles idempotency using report_<reportId>.
  const reward = await rewardCrowdReport({
    uid: report.uid,
    reportId,
    valid
  })

  return {
    reportId,
    uid: report.uid,
    valid,
    reward,
    placeUpdated
  }
}
