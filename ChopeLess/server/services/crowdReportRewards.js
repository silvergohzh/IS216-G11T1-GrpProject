
import { db } from '../firebase.js'
import { rewardCrowdReport } from './points.js'

const reports = db.collection('crowdReports')

function fail(status, message) {
  return Object.assign(new Error(message), { status })
}

// Called only after a trusted verification process has
// determined whether a submitted crowd report is valid.
//
// The report must already exist in Firestore.
// Its owner is read from Firestore, not supplied by the client.

export async function processVerifiedCrowdReport(reportId, valid) {
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

  const reportRef = reports.doc(reportId)
  const snapshot = await reportRef.get()

  if (!snapshot.exists) {
    throw fail(404, 'Crowd report not found')
  }

  const report = snapshot.data()

  if (!report.uid) {
    throw fail(400, 'Report has no authenticated owner')
  }

  if (report.verificationStatus !== 'verified') {
    throw fail(409, 'Report has not completed verification')
  }

  if (report.valid !== valid) {
    throw fail(409, 'Verification result does not match the stored report')
  }

  // Uses eventId "report_<reportId>" to prevent duplicate rewards.
  const reward = await rewardCrowdReport({
    uid: report.uid,
    reportId,
    valid
  })

  return {
    reportId,
    uid: report.uid,
    valid,
    reward
  }
}
