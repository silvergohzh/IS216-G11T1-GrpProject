
import { Router } from 'express'
import { db } from '../firebase.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCrowdReport } from '../services/crowdReportVerification.js'

const router = Router()

router.use(requireAuth)

function requireVerifier(req, res, next) {
  const allowed = (process.env.CROWD_REPORT_VERIFIER_UIDS || '')
    .split(',')
    .map(uid => uid.trim())
    .filter(Boolean)

  if (!allowed.includes(req.uid)) {
    return res.status(403).json({
      error: 'Only authorized verifiers can review crowd reports'
    })
  }

  next()
}

// Check whether the logged-in user is an authorized verifier.
router.get('/verifier-access', requireVerifier, (req, res) => {
  res.json({ authorized: true })
})

// Retrieve reports waiting for verification.
router.get('/pending', requireVerifier, async (req, res, next) => {
  try {
    const snapshot = await db
      .collection('crowdReports')
      .where('verificationStatus', '==', 'pending')
      .get()

    const reports = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.createdAt - a.createdAt)

    res.json(reports)
  } catch (error) {
    next(error)
  }
})

// Verify a report and process its points.
router.patch('/:id/verify', requireVerifier, async (req, res, next) => {
  try {
    const result = await verifyCrowdReport({
      reportId: req.params.id,
      valid: req.body?.valid,
      verifiedBy: req.uid
    })

    res.json(result)
  } catch (error) {
    next(error)
  }
})

export default router
