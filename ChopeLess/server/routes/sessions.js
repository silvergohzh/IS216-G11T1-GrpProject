// Trusted session actions. Owner: M1 (Session and voting back-end)
// Creating, joining and changing settings happen in the browser (see client/src/services/sessions.js),
// protected by firestore.rules. Starting the vote and voting happen here so nobody can fake a winner.
import { Router } from 'express'
import { db } from '../firebase.js'
import { requireAuth } from '../middleware/auth.js'
import { buildShortlist } from '../services/shortlist.js'

const router = Router()
router.use(requireAuth)

// START VOTING: host only. Locks membership and saves the shortlist (M2's engine).
router.post('/:code/start', async (req, res, next) => {
  try {
    const ref = db.collection('sessions').doc(req.params.code)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ error: 'Session not found' })
    const session = snap.data()
    if (session.hostUid !== req.uid) return res.status(403).json({ error: 'Only the host can start voting' })
    if (session.status !== 'lobby') return res.status(409).json({ error: 'Voting has already started' })

    const shortlist = await buildShortlist(session)
    if (!shortlist.length) return res.status(422).json({ error: 'No places fit the group. Try a higher budget or longer walk.' })

    await ref.update({ shortlist, status: 'voting', votes: {} })
    res.json({ ok: true, count: shortlist.length })
  } catch (err) { next(err) }
})

// VOTE: { placeId, yes }. Runs in a transaction so two people voting at once can't clash.
router.post('/:code/vote', async (req, res, next) => {
  try {
    const { placeId, yes } = req.body
    const ref = db.collection('sessions').doc(req.params.code)

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref)
      if (!snap.exists) throw Object.assign(new Error('Session not found'), { status: 404 })
      const session = snap.data()
      if (session.status !== 'voting') throw Object.assign(new Error('Voting is not open'), { status: 409 })
      if (!session.members[req.uid]) throw Object.assign(new Error('You are not in this session'), { status: 403 })

      const place = session.shortlist.find(p => p.id === placeId)
      if (!place) throw Object.assign(new Error('That place is not on the shortlist'), { status: 400 })

      const votes = session.votes || {}
      votes[placeId] = { ...(votes[placeId] || {}), [req.uid]: !!yes }

      // Winner rule: the first place every member said yes to
      const memberIds = Object.keys(session.members)
      const allYes = memberIds.every(uid => votes[placeId][uid] === true)
      const update = { votes }
      if (allYes) {
        update.winner = place
        update.status = 'done'
      }
      // TODO (M1): if everyone has voted on every place and nobody matched,
      //            pick the place with the most yes votes as the winner.
      tx.update(ref, update)
      return { winner: allYes ? place : null }
    })

    res.json(result)
  } catch (err) { next(err) }
})

export default router
