
// Trusted session actions — M1 Voting Engine
// Maintains Silver's timer, Round 2, Super Like, Veto,
// tie-wheel and history features, with additional backend safeguards.

import { Router } from "express";
import { db } from "../firebase.js";
import { requireAuth } from "../middleware/auth.js";
import { buildShortlist } from "../services/shortlist.js";
import { decide, mostLiked } from "../services/winner.js";
import { awardSessionPoints } from "../services/points.js";

const router = Router();
router.use(requireAuth);

const fail = (status, message) =>
  Object.assign(new Error(message), { status });

// Save Makan History for each member.
// The session code is used as the document ID.
async function saveHistory(session, winner) {
  if (!winner) return;

  const memberIds = Object.keys(session.members || {});
  const batch = db.batch();

  for (const uid of memberIds) {
    batch.set(
      db.collection("users")
        .doc(uid)
        .collection("history")
        .doc(session.code),
      {
        code: session.code,
        placeId: winner.id,
        placeName: winner.name,
        cuisine: winner.cuisine || "",
        groupSize: memberIds.length,
        groupId: session.groupId || null,
        at: Date.now()
      }
    );
  }

  await batch.commit();
}



// NEW: Award Makan Points when a session finishes.
async function saveSessionRewards(session) {
  const snap = await db
    .collection("sessions")
    .doc(session.code)
    .get();

  if (!snap.exists) return;

  const latest = snap.data();

  if (latest.status !== "done" || !latest.winner) return;

  await awardSessionPoints(latest);
}

// ROUND 2
// Relax the limits and prefer new restaurants.
// Preserve which users already spent their Super Like or Veto.



// ROUND 2
// Relax the limits and prefer new restaurants.
// Preserve which users already spent their Super Like or Veto.
async function startRound2(ref) {
  const firstSnap = await ref.get();

  if (!firstSnap.exists) return;

  const first = firstSnap.data();

  if (
    first.status !== "voting" ||
    (first.round || 1) !== 1
  ) {
    return;
  }

  const relaxed = {
    ...first,
    maxWalkMins: first.maxWalkMins + 5,
    maxWaitMins: first.maxWaitMins + 10
  };

  const seen = new Set(
    (first.shortlist || []).map(p => p.id)
  );

  const vetoedIds = new Set(
    Object.values(first.vetoes || {})
  );

  let list = await buildShortlist(relaxed);

  // Previously vetoed restaurants must stay excluded.
  list = list.filter(p => !vetoedIds.has(p.id));

  const fresh = list.filter(p => !seen.has(p.id));

  if (fresh.length) {
    list = fresh;
  }

  // If no new places are available, reuse safe Round 1 places.
  if (!list.length) {
    list = (first.shortlist || [])
      .filter(p => !vetoedIds.has(p.id));
  }

  list = list.map(p => ({
    ...p,
    outside:
      p.walkMins > first.maxWalkMins ||
      p.waitMins > first.maxWaitMins
  }));

  const seconds = first.voteSeconds ?? 60;

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);

    if (!snap.exists) return;

    const session = snap.data();

    if (
      session.status !== "voting" ||
      (session.round || 1) !== 1
    ) {
      return;
    }

    // Recheck vetoes in case a vote was submitted
    // while the new shortlist was being generated.
    const latestVetoed = new Set(
      Object.values(session.vetoes || {})
    );

    const safeList = list.filter(
      p => !latestVetoed.has(p.id)
    );

    // No safe restaurants remain.
    if (!safeList.length) {
      tx.update(ref, {
        status: "done",
        winner: null,
        tieBreak: null
      });
      return;
    }

    tx.update(ref, {
      round: 2,
      shortlist: safeList,
      votes: {},

      // IMPORTANT:
      // Do not reset these in Round 2.
      // One Super Like and one Veto per session.
      superLikes: session.superLikes || {},
      vetoes: session.vetoes || {},

      votingEndsAt: seconds
        ? Date.now() + seconds * 1000
        : null
    });
  });
}

// FINISH VOTING
// Choose a winner or move to Round 2.
async function endVoting(ref, { requireTimeUp }) {
  const outcome = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);

    if (!snap.exists) return {};

    const session = snap.data();

    if (session.status !== "voting") {
      return {};
    }

    if (
      requireTimeUp &&
      session.votingEndsAt &&
      Date.now() < session.votingEndsAt - 3000
    ) {
      throw fail(409, "Voting is still open");
    }

    const result =
      decide(session) ||
      (
        (session.round || 1) >= 2
          ? mostLiked(session)
          : null
      );

    if (!result) {
      return { round2: true };
    }

    tx.update(ref, result);

    return {
      done: true,
      session,
      winner: result.winner
    };
  });

  if (outcome.round2) {
    await startRound2(ref);
  }

  if (outcome.done && outcome.winner) {
  await saveHistory(outcome.session, outcome.winner);
  await saveSessionRewards(outcome.session);
}
}

// START VOTING
router.post("/:code/start", async (req, res, next) => {
  try {
    const ref = db.collection("sessions").doc(req.params.code);
    const snap = await ref.get();

    if (!snap.exists) {
      throw fail(404, "Session not found");
    }

    const session = snap.data();

    if (session.hostUid !== req.uid) {
      throw fail(403, "Only the host can start voting");
    }

    if (session.status !== "lobby") {
      throw fail(409, "Voting has already started");
    }

    if (session.expiresAt.toMillis() < Date.now()) {
      throw fail(410, "Session has expired");
    }

    if (Object.keys(session.members || {}).length < 2) {
      throw fail(400, "You need at least 2 people to vote");
    }

    const shortlist = await buildShortlist(session);

    if (!shortlist.length) {
      throw fail(
        422,
        "No places fit the group. Try a higher budget or longer walk."
      );
    }

    await db.runTransaction(async tx => {
      const latestSnap = await tx.get(ref);

      if (!latestSnap.exists) {
        throw fail(404, "Session not found");
      }

      const latest = latestSnap.data();

      if (latest.hostUid !== req.uid) {
        throw fail(403, "Only the host can start voting");
      }

      if (latest.status !== "lobby") {
        throw fail(409, "Voting has already started");
      }

      if (latest.expiresAt.toMillis() < Date.now()) {
        throw fail(410, "Session has expired");
      }

      if (Object.keys(latest.members || {}).length < 2) {
        throw fail(400, "You need at least 2 people to vote");
      }

      const seconds = latest.voteSeconds ?? 60;

      tx.update(ref, {
        shortlist,
        status: "voting",
        round: 1,
        votes: {},
        superLikes: {},
        vetoes: {},
        tieBreak: null,
        votingEndsAt: seconds
          ? Date.now() + seconds * 1000
          : null
      });
    });

    res.json({
      ok: true,
      count: shortlist.length
    });
  } catch (err) {
    next(err);
  }
});

// VOTE
// Body: { placeId, yes, special }
// special may be "super", "veto" or omitted.
router.post("/:code/vote", async (req, res, next) => {
  try {
    const { placeId, yes, special } = req.body;

    if (
      typeof placeId !== "string" ||
      placeId.trim() === ""
    ) {
      throw fail(400, "Invalid place ID");
    }

    if (typeof yes !== "boolean") {
      throw fail(400, "Vote must be YES or NO");
    }

    if (
      special !== undefined &&
      special !== null &&
      !["super", "veto"].includes(special)
    ) {
      throw fail(400, "Unknown vote type");
    }

    const ref = db.collection("sessions").doc(req.params.code);

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);

      if (!snap.exists) {
        throw fail(404, "Session not found");
      }

      const session = snap.data();

      if (session.status !== "voting") {
        throw fail(409, "Voting is not open");
      }

      if (session.expiresAt.toMillis() < Date.now()) {
        throw fail(410, "Session has expired");
      }

      if (
        session.votingEndsAt &&
        Date.now() > session.votingEndsAt + 2000
      ) {
        throw fail(409, "Time's up");
      }

      if (!session.members?.[req.uid]) {
        throw fail(403, "You are not in this session");
      }

      const place = session.shortlist.find(
        p => p.id === placeId
      );

      if (!place) {
        throw fail(400, "That place is not on the shortlist");
      }

      const votes = session.votes || {};
      const superLikes = session.superLikes || {};
      const vetoes = session.vetoes || {};

      // Vetoed restaurants are removed from voting.
      if (Object.values(vetoes).includes(placeId)) {
        throw fail(
          409,
          "This restaurant has been vetoed"
        );
      }

      // Prevent duplicate votes.
      if (votes[placeId]?.[req.uid] !== undefined) {
        throw fail(409, "You have already voted");
      }

      // Enforce one Super Like per session.
      if (special === "super") {
        if (superLikes[req.uid]) {
          throw fail(
            409,
            "You have already used your Super Like"
          );
        }

        superLikes[req.uid] = placeId;
      }

      // Enforce one Veto per session.
      if (special === "veto") {
        if (vetoes[req.uid]) {
          throw fail(
            409,
            "You have already used your Veto"
          );
        }

        vetoes[req.uid] = placeId;
      }

      const isYes =
        special === "super"
          ? true
          : special === "veto"
            ? false
            : yes;

      votes[placeId] = {
        ...(votes[placeId] || {}),
        [req.uid]: isYes
      };

      const memberIds = Object.keys(session.members);
      const vetoed = Object.values(vetoes);

      const update = {
        votes,
        superLikes,
        vetoes
      };

      // Immediate unanimous YES winner.
      if (
        !vetoed.includes(placeId) &&
        memberIds.every(
          uid => votes[placeId]?.[uid] === true
        )
      ) {
        tx.update(ref, {
          ...update,
          winner: place,
          status: "done",
          tieBreak: null
        });

        return {
          done: true,
          session,
          winner: place
        };
      }

      tx.update(ref, update);

      // Check whether everyone voted on
      // every restaurant still in play.
      const remaining = session.shortlist.filter(
        p => !vetoed.includes(p.id)
      );

      const allVoted = remaining.every(p =>
        memberIds.every(
          uid => votes[p.id]?.[uid] !== undefined
        )
      );

      return { allVoted };
    });

    if (result.done && result.winner) {
  await saveHistory(result.session, result.winner);
  await saveSessionRewards(result.session);
}
    if (result.allVoted) {
      await endVoting(ref, {
        requireTimeUp: false
      });
    }

    res.json({
      ok: true,
      winner: result.winner || null
    });
  } catch (err) {
    next(err);
  }
});

// FINISH VOTING
// Called when the countdown ends.
router.post("/:code/finish", async (req, res, next) => {
  try {
    const ref = db.collection("sessions").doc(req.params.code);
    const snap = await ref.get();

    if (!snap.exists) {
      throw fail(404, "Session not found");
    }

    if (!snap.data().members?.[req.uid]) {
      throw fail(403, "You are not in this session");
    }

    await endVoting(ref, {
      requireTimeUp: true
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
