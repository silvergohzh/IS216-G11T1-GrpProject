// Trusted session actions. Owner: M1 (Session and voting back-end)
// Tie wheel, round 2, history) merged in with Silver; Janani's checks are kept.
// Creating, joining and changing settings happen in the browser (see client/src/services/sessions.js),
// protected by firestore.rules. Starting the vote and voting happen here so nobody can fake a winner.
import { Router } from "express";
import { db } from "../firebase.js";
import { requireAuth } from "../middleware/auth.js";
import { buildShortlist } from "../services/shortlist.js";
import { decide, mostLiked } from "../services/winner.js";

const router = Router();
router.use(requireAuth);

const fail = (status, message) => Object.assign(new Error(message), { status });

// Save one Makan History entry per member when a session finishes (read by the History page)
async function saveHistory(session, winner) {
  const memberIds = Object.keys(session.members);
  const batch = db.batch();
  for (const uid of memberIds) {
    batch.set(
      db.collection("users").doc(uid).collection("history").doc(session.code),
      {
        code: session.code,
        placeId: winner.id,
        placeName: winner.name,
        cuisine: winner.cuisine || "",
        groupSize: memberIds.length,
        groupId: session.groupId || null,
        at: Date.now(),
      },
    );
  }
  await batch.commit();
}

// Round 2: relax the limits, prefer new places, reset votes and the timer
async function startRound2(ref) {
  const first = (await ref.get()).data();
  if (!first || first.status !== "voting" || (first.round || 1) !== 1) return;
  const relaxed = {
    ...first,
    maxWalkMins: first.maxWalkMins + 5,
    maxWaitMins: first.maxWaitMins + 10,
  };
  const seen = first.shortlist.map((p) => p.id);
  let list = await buildShortlist(relaxed);
  const fresh = list.filter((p) => !seen.includes(p.id));
  if (fresh.length) list = fresh; // prefer places the group hasn't seen yet
  if (!list.length) list = first.shortlist; // never leave the group with nothing
  list = list.map((p) => ({
    ...p,
    outside: p.walkMins > first.maxWalkMins || p.waitMins > first.maxWaitMins,
  }));
  const seconds = first.voteSeconds ?? 60;
  await db.runTransaction(async (tx) => {
    const s = (await tx.get(ref)).data();
    if (!s || s.status !== "voting" || (s.round || 1) !== 1) return; // another phone already started it
    tx.update(ref, {
      round: 2,
      shortlist: list,
      votes: {},
      superLikes: {},
      vetoes: {},
      votingEndsAt: seconds ? Date.now() + seconds * 1000 : null,
    });
  });
}

// Ends voting: picks a winner (tie = random spin), or starts round 2. Safe to call more than once.
async function endVoting(ref, { requireTimeUp }) {
  const outcome = await db.runTransaction(async (tx) => {
    const session = (await tx.get(ref)).data();
    if (!session || session.status !== "voting") return {}; // already finished
    if (
      requireTimeUp &&
      session.votingEndsAt &&
      Date.now() < session.votingEndsAt - 3000
    ) {
      throw fail(409, "Voting is still open");
    }
    const result =
      decide(session) ||
      ((session.round || 1) >= 2 ? mostLiked(session) : null);
    if (!result) return { round2: true };
    tx.update(ref, result);
    return { done: true, session, winner: result.winner };
  });
  if (outcome.round2) await startRound2(ref);
  if (outcome.done) await saveHistory(outcome.session, outcome.winner);
}

// START VOTING: host only, at least 2 people, session not expired. Saves the shortlist and starts the timer.
router.post("/:code/start", async (req, res, next) => {
  try {
    const ref = db.collection("sessions").doc(req.params.code);
    const snap = await ref.get();
    if (!snap.exists) throw fail(404, "Session not found");
    const session = snap.data();
    if (session.hostUid !== req.uid)
      throw fail(403, "Only the host can start voting");
    if (session.status !== "lobby")
      throw fail(409, "Voting has already started");
    if (session.expiresAt.toMillis() < Date.now())
      throw fail(410, "Session has expired");
    if (Object.keys(session.members).length < 2)
      throw fail(400, "You need at least 2 people to vote");

    const shortlist = await buildShortlist(session);
    if (!shortlist.length)
      throw fail(
        422,
        "No places fit the group. Try a higher budget or longer walk.",
      );

    // Re-check inside a transaction in case something changed while the shortlist was being built
    await db.runTransaction(async (tx) => {
      const latestSnap = await tx.get(ref);
      if (!latestSnap.exists) throw fail(404, "Session not found");
      const latest = latestSnap.data();
      if (latest.hostUid !== req.uid)
        throw fail(403, "Only the host can start voting");
      if (latest.status !== "lobby")
        throw fail(409, "Voting has already started");
      if (latest.expiresAt.toMillis() < Date.now())
        throw fail(410, "Session has expired");

      const seconds = latest.voteSeconds ?? 60;
      tx.update(ref, {
        shortlist,
        status: "voting",
        round: 1,
        votes: {},
        superLikes: {},
        vetoes: {},
        tieBreak: null,
        votingEndsAt: seconds ? Date.now() + seconds * 1000 : null,
      });
    });

    res.json({ ok: true, count: shortlist.length });
  } catch (err) {
    next(err);
  }
});

// VOTE: { placeId, yes, special: 'super' | 'veto' | undefined }. Runs in a transaction so votes can't clash.
router.post("/:code/vote", async (req, res, next) => {
  try {
    const { placeId, yes, special } = req.body;
    if (typeof placeId !== "string" || placeId.trim() === "")
      throw fail(400, "Invalid place ID");
    if (typeof yes !== "boolean") throw fail(400, "Vote must be YES or NO");
    if (
      special !== undefined &&
      special !== null &&
      !["super", "veto"].includes(special)
    ) {
      throw fail(400, "Unknown vote type");
    }
    const ref = db.collection("sessions").doc(req.params.code);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw fail(404, "Session not found");
      const session = snap.data();
      if (session.status !== "voting") throw fail(409, "Voting is not open");
      if (session.expiresAt.toMillis() < Date.now())
        throw fail(410, "Session has expired");
      if (session.votingEndsAt && Date.now() > session.votingEndsAt + 2000)
        throw fail(409, "Time's up");
      if (!session.members[req.uid])
        throw fail(403, "You are not in this session");

      const place = session.shortlist.find((p) => p.id === placeId);
      if (!place) throw fail(400, "That place is not on the shortlist");

      const votes = session.votes || {};
      if (votes[placeId]?.[req.uid] !== undefined)
        throw fail(409, "You have already voted");

      const superLikes = session.superLikes || {};
      const vetoes = session.vetoes || {};
      if (special === "super") {
        if (superLikes[req.uid])
          throw fail(409, "You have already used your Super Like");
        superLikes[req.uid] = placeId;
      }
      if (special === "veto") {
        if (vetoes[req.uid]) throw fail(409, "You have already used your Veto");
        vetoes[req.uid] = placeId;
      }
      const isYes =
        special === "super" ? true : special === "veto" ? false : yes;
      votes[placeId] = { ...(votes[placeId] || {}), [req.uid]: isYes };

      const memberIds = Object.keys(session.members);
      const vetoed = Object.values(vetoes);
      const update = { votes, superLikes, vetoes };

      // Instant match: every member said yes to this place, and nobody vetoed it
      if (
        !vetoed.includes(placeId) &&
        memberIds.every((uid) => votes[placeId][uid] === true)
      ) {
        tx.update(ref, {
          ...update,
          winner: place,
          status: "done",
          tieBreak: null,
        });
        return { done: true, session, winner: place };
      }
      tx.update(ref, update);

      // Has everyone voted on every place still in play? Then decide now instead of waiting for the timer
      const allVoted = session.shortlist
        .filter((p) => !vetoed.includes(p.id))
        .every((p) =>
          memberIds.every((uid) => votes[p.id]?.[uid] !== undefined),
        );
      return { allVoted };
    });

    if (result.done) await saveHistory(result.session, result.winner);
    if (result.allVoted) await endVoting(ref, { requireTimeUp: false });
    res.json({ ok: true, winner: result.winner || null });
  } catch (err) {
    next(err);
  }
});

// FINISH: called by the phones when the timer runs out. Any member may call it; it only acts once.
router.post("/:code/finish", async (req, res, next) => {
  try {
    const ref = db.collection("sessions").doc(req.params.code);
    const snap = await ref.get();
    if (!snap.exists) throw fail(404, "Session not found");
    if (!snap.data().members[req.uid])
      throw fail(403, "You are not in this session");
    await endVoting(ref, { requireTimeUp: true });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

/*
// START VOTING: host only. Locks membership and saves the shortlist (M2's engine).
router.post('/:code/start', async (req, res, next) => {
  try {
    const ref = db.collection('sessions').doc(req.params.code)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ error: 'Session not found' })
    const session = snap.data()
    if (session.hostUid !== req.uid) return res.status(403).json({ error: 'Only the host can start voting' })
    if (session.status !== 'lobby') return res.status(409).json({ error: 'Voting has already started' })
    if (session.expiresAt.toMillis() < Date.now()) {
      return res.status(410).json({
        error: 'Session has expired'
      })
    }

    const shortlist = await buildShortlist(session)
    if (!shortlist.length) return res.status(422).json({ error: 'No places fit the group. Try a higher budget or longer walk.' })

    
await db.runTransaction(async tx => {
  const latestSnap = await tx.get(ref)

  if (!latestSnap.exists) {
    throw Object.assign(new Error('Session not found'), { status: 404 })
  }

  const latestSession = latestSnap.data()

  if (latestSession.hostUid !== req.uid) {
    throw Object.assign(new Error('Only the host can start voting'), { status: 403 })
  }

  if (latestSession.status !== 'lobby') {
    throw Object.assign(new Error('Voting has already started'), { status: 409 })
  }

  if (latestSession.expiresAt.toMillis() < Date.now()) {
    throw Object.assign(new Error('Session has expired'), { status: 410 })
  }

  tx.update(ref, {
    shortlist,
    status: 'voting',
    votes: {}
  })
})

    res.json({ ok: true, count: shortlist.length })
  } catch (err) { next(err) }
})

// VOTE: { placeId, yes }. Runs in a transaction so two people voting at once can't clash.
router.post('/:code/vote', async (req, res, next) => {
  try {
    const { placeId, yes } = req.body
    
    if (typeof placeId !== 'string' || placeId.trim() === '') {
  return res.status(400).json({ error: 'Invalid place ID' })
}

if (typeof yes !== 'boolean') {
  return res.status(400).json({ error: 'Vote must be YES or NO' })
}
    const ref = db.collection('sessions').doc(req.params.code)

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref)
      if (!snap.exists) throw Object.assign(new Error('Session not found'), { status: 404 })
      const session = snap.data()

      if (session.status !== 'voting') throw Object.assign(new Error('Voting is not open'), { status: 409 })

      if (session.expiresAt.toMillis() < Date.now()) {
        throw Object.assign(
          new Error('Session has expired'),
          { status: 410 }
        )
      }


      if (!session.members[req.uid]) throw Object.assign(new Error('You are not in this session'), { status: 403 })

      const place = session.shortlist.find(p => p.id === placeId)
      if (!place) throw Object.assign(new Error('That place is not on the shortlist'), { status: 400 })

      const votes = session.votes || {}
      if (votes[placeId]?.[req.uid] !== undefined) {
        throw Object.assign(
          new Error('You have already voted'),
          { status: 409 }
        )
      }
      votes[placeId] = {
        ...(votes[placeId] || {}),
        [req.uid]: yes
      }

      // Winner rule: the first place every member said yes to
      const memberIds = Object.keys(session.members)
      const allYes = memberIds.every(uid => votes[placeId][uid] === true)
      const update = { votes }
      if (allYes) {
        update.winner = place
        update.status = 'done'
      }
      

      if (!allYes) {
  let everyoneFinished = true

  // Check whether every member has voted on every place
  for (const p of session.shortlist) {
    for (const uid of memberIds) {
      if (votes[p.id]?.[uid] === undefined) {
        everyoneFinished = false
      }
    }
  }

  if (everyoneFinished) {
    let highestYes = -1
let tiedPlaces = []

// Count YES votes and collect tied restaurants
for (const p of session.shortlist) {
  let yesCount = 0

  for (const uid of memberIds) {
    if (votes[p.id][uid] === true) {
      yesCount++
    }
  }

  if (yesCount > highestYes) {
    highestYes = yesCount
    tiedPlaces = [p]
  } else if (yesCount === highestYes) {
    tiedPlaces.push(p)
  }
}

// Randomly choose from restaurants with the highest votes
const randomIndex = Math.floor(Math.random() * tiedPlaces.length)

update.winner = tiedPlaces[randomIndex]
update.status = 'done'
  }
}
            tx.update(ref, update)
      return { winner: update.winner || null }
    }) // Transaction ends here

    // ADD THIS HERE
    
    res.json(result)

  } catch (err) {
    next(err)
  }
})
export default router
*/
