
import { Router } from 'express'
import { db } from '../firebase.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.use(requireAuth)

router.post('/', async (req, res, next) => {
  try {
    const { placeId, queueMinutes, comment } = req.body

    if (typeof placeId !== 'string' || !placeId.trim() || placeId.includes('/')) {
      return res.status(400).json({ error: 'Valid place ID required' })
    }

    if (
      !Number.isInteger(queueMinutes) ||
      queueMinutes < 0 ||
      queueMinutes > 240
    ) {
      return res.status(400).json({
        error: 'Queue time must be between 0 and 240 minutes'
      })
    }

    if (comment !== undefined && (
      typeof comment !== 'string' ||
      comment.length > 500
    )) {
      return res.status(400).json({ error: 'Comment must be 500 characters or fewer' })
    }

    // Limit each user to one report per restaurant every 30 minutes.

    const placeSnap = await db.collection('places').doc(placeId).get()

    if (!placeSnap.exists) {
      return res.status(404).json({ error: 'Place not found' })
    }

    const reportRef = db.collection('crowdReports').doc()

    const report = {
      uid: req.uid,
      placeId,
      queueMinutes,
      comment: comment?.trim() || '',
      verificationStatus: 'pending',
      valid: null,
      createdAt: Date.now()
    }

const COOLDOWN_MS = 30 * 60 * 1000

const cooldownRef = db
  .collection('crowdReportCooldowns')
  .doc(req.uid)
  .collection('places')
  .doc(placeId)

try {
  await db.runTransaction(async tx => {
    const cooldownSnap = await tx.get(cooldownRef)

    const lastSubmittedAt = cooldownSnap.exists
      ? cooldownSnap.data().lastSubmittedAt
      : null

    if (
      typeof lastSubmittedAt === 'number' &&
      Date.now() - lastSubmittedAt < COOLDOWN_MS
    ) {
      const error = new Error(
        'You can only submit one report per restaurant every 30 minutes'
      )
      error.status = 429
      throw error
    }

    tx.create(reportRef, report)

    tx.set(cooldownRef, {
      uid: req.uid,
      placeId,
      lastSubmittedAt: report.createdAt
    })
  })
} catch (error) {
  if (error.status === 429) {
    return res.status(429).json({ error: error.message })
  }

  throw error
}

res.status(201).json({
  id: reportRef.id,
  ...report
})
  } catch (error) {
    next(error)
  }
})

// Users can view their own submitted reports.
router.get('/mine', async (req, res, next) => {
  try {
    const snapshot = await db
      .collection('crowdReports')
      .where('uid', '==', req.uid)
      .get()

    const reports = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.createdAt - a.createdAt)

    res.json(reports)
  } catch (error) {
    next(error)
  }
})

export default router
