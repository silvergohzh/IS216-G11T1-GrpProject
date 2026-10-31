
/*
 * ChopeLess — Makan Session Voting Engine
 *
 * Supports:
 * - YES / NO voting
 * - 45-second default voting timer
 * - One free Super Like per member
 * - Purchased Super Likes (20 Makan Points each)
 * - Extra Super Like scoring
 * - One Veto per member
 * - Round 2
 * - Winner selection and tie-breaking
 * - Makan History
 * - Makan Points rewards
 * - Refunds for unused purchased Super Likes
 */

import { Router } from "express";
import { db } from "../firebase.js";
import { requireAuth } from "../middleware/auth.js";
import { buildShortlist } from "../services/shortlist.js";
import { decide, mostLiked } from "../services/winner.js";

import {
  awardSessionPoints,
  purchaseExtraSuperLike,
  refundUnusedSuperLikes
} from "../services/points.js";

const router = Router();

router.use(requireAuth);

const fail = (status, message) =>
  Object.assign(new Error(message), { status });

// =====================================================
// HELPERS
// =====================================================

function isExpired(session) {
  if (!session.expiresAt) return false;

  const expiry =
    typeof session.expiresAt.toMillis === "function"
      ? session.expiresAt.toMillis()
      : typeof session.expiresAt === "number"
        ? session.expiresAt
        : new Date(session.expiresAt).getTime();

  return Date.now() >= expiry;
}

function votingDuration(session) {
  return session.voteSeconds ?? 45;
}

function purchasedSuperLikesAvailable(session, uid) {
  const record = session.extraSuperLikes?.[uid] || {};

  return Math.max(
    0,
    (record.purchased || 0) -
      (record.used || 0) -
      (record.refunded || 0)
  );
}

// =====================================================
// MAKAN HISTORY
// =====================================================

async function saveHistory(session, winner) {
  if (!winner) return;

  const memberIds = Object.keys(session.members || {});

  if (!memberIds.length) return;

  const batch = db.batch();

  for (const uid of memberIds) {
    const historyRef = db
      .collection("users")
      .doc(uid)
      .collection("history")
      .doc(session.code);

    batch.set(historyRef, {
      code: session.code,
      placeId: winner.id,
      placeName: winner.name,
      cuisine: winner.cuisine || "",
      groupSize: memberIds.length,
      groupId: session.groupId || null,
      at: Date.now()
    });
  }

  await batch.commit();
}

// =====================================================
// REWARDS AND REFUNDS
// =====================================================

async function processCompletedSession(sessionCode) {
  const snap = await db
    .collection("sessions")
    .doc(sessionCode)
    .get();

  if (!snap.exists) return;

  const session = snap.data();

  if (session.status !== "done") return;

  // Refund unused purchased Super Likes,
  // including sessions that end without a winner.
  await refundUnusedSuperLikes(sessionCode);

  if (!session.winner) return;

  await saveHistory(session, session.winner);
  await awardSessionPoints(session);
}

// =====================================================
// ROUND 2
// =====================================================

async function startRound2(ref) {
  const firstSnap = await ref.get();

  if (!firstSnap.exists) return {};

  const first = firstSnap.data();

  if (
    first.status !== "voting" ||
    (first.round || 1) !== 1
  ) {
    return {};
  }

  const relaxed = {
    ...first,
    maxWalkMins: (first.maxWalkMins ?? 10) + 5,
    maxWaitMins: (first.maxWaitMins ?? 15) + 10
  };

  const seen = new Set(
    (first.shortlist || []).map(place => place.id)
  );

  const vetoedIds = new Set(
    Object.values(first.vetoes || {})
  );

  let list = await buildShortlist(relaxed);

  list = list.filter(
    place => !vetoedIds.has(place.id)
  );

  const fresh = list.filter(
    place => !seen.has(place.id)
  );

  if (fresh.length) {
    list = fresh;
  }

  if (!list.length) {
    list = (first.shortlist || []).filter(
      place => !vetoedIds.has(place.id)
    );
  }

  list = list.map(place => ({
    ...place,
    outside:
      place.walkMins > (first.maxWalkMins ?? 10) ||
      place.waitMins > (first.maxWaitMins ?? 15)
  }));

  const outcome = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);

    if (!snap.exists) return {};

    const session = snap.data();

    if (
      session.status !== "voting" ||
      (session.round || 1) !== 1
    ) {
      return {};
    }

    const latestVetoed = new Set(
      Object.values(session.vetoes || {})
    );

    const safeList = list.filter(
      place => !latestVetoed.has(place.id)
    );

    if (!safeList.length) {
      tx.update(ref, {
        status: "done",
        winner: null,
        tieBreak: null,
        completedAt: Date.now()
      });

      return { done: true };
    }

    const seconds = votingDuration(session);

    tx.update(ref, {
      round: 2,
      shortlist: safeList,

      // Round 2 starts a fresh set of normal votes.
      votes: {},

      // Preserve special votes used in Round 1.
      superLikes: session.superLikes || {},
      vetoes: session.vetoes || {},

      // Preserve purchased extras and their usage.
      extraSuperLikes: session.extraSuperLikes || {},

      // Preserve the restaurants that received
      // purchased Super Likes in Round 1.
      extraSuperLikeVotes:
        session.extraSuperLikeVotes || {},

      votingEndsAt: seconds
        ? Date.now() + seconds * 1000
        : null
    });

    return { round2: true };
  });

  if (outcome.done) {
    await processCompletedSession(ref.id);
  }

  return outcome;
}

// =====================================================
// FINISH VOTING
// =====================================================

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
      Date.now() < session.votingEndsAt
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

    tx.update(ref, {
      ...result,
      completedAt: Date.now()
    });

    return {
      done: true,
      winner: result.winner
    };
  });

  if (outcome.round2) {
    return startRound2(ref);
  }

  if (outcome.done) {
    await processCompletedSession(ref.id);
  }

  return outcome;
}

// =====================================================
// START VOTING
// POST /api/sessions/:code/start
// =====================================================

router.post("/:code/start", async (req, res, next) => {
  try {
    const ref = db
      .collection("sessions")
      .doc(req.params.code);

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

    if (isExpired(session)) {
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

      if (isExpired(latest)) {
        throw fail(410, "Session has expired");
      }

      if (Object.keys(latest.members || {}).length < 2) {
        throw fail(400, "You need at least 2 people to vote");
      }

      const seconds = votingDuration(latest);

      tx.update(ref, {
        shortlist,
        status: "voting",
        round: 1,

        votes: {},
        superLikes: {},
        vetoes: {},

        // Purchased Super Like balances.
        extraSuperLikes: {},

        // Purchased Super Like votes by restaurant.
        // Shape: { uid: [placeId, placeId, ...] }
        extraSuperLikeVotes: {},

        tieBreak: null,
        winner: null,
        completedAt: null,

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

// =====================================================
// PURCHASE EXTRA SUPER LIKE
// POST /api/sessions/:code/buy-super-like
// =====================================================

router.post(
  "/:code/buy-super-like",
  async (req, res, next) => {
    try {
      const result = await purchaseExtraSuperLike({
        uid: req.uid,
        sessionCode: req.params.code
      });

      res.json({
        ok: true,
        ...result
      });
    } catch (err) {
      next(err);
    }
  }
);

// =====================================================
// CAST VOTE
// POST /api/sessions/:code/vote
// =====================================================

router.post("/:code/vote", async (req, res, next) => {
  try {
    const { placeId, yes, special } = req.body || {};

    if (
      typeof placeId !== "string" ||
      !placeId.trim()
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

    const ref = db
      .collection("sessions")
      .doc(req.params.code);

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);

      if (!snap.exists) {
        throw fail(404, "Session not found");
      }

      const session = snap.data();

      if (session.status !== "voting") {
        throw fail(409, "Voting is not open");
      }

      if (isExpired(session)) {
        throw fail(410, "Session has expired");
      }

      if (
        session.votingEndsAt &&
        Date.now() > session.votingEndsAt
      ) {
        throw fail(409, "Time's up");
      }

      if (!session.members?.[req.uid]) {
        throw fail(403, "You are not in this session");
      }

      const place = (session.shortlist || []).find(
        item => item.id === placeId
      );

      if (!place) {
        throw fail(
          400,
          "That place is not on the shortlist"
        );
      }

      const votes = {
        ...(session.votes || {})
      };

      const superLikes = {
        ...(session.superLikes || {})
      };

      const vetoes = {
        ...(session.vetoes || {})
      };

      const extraSuperLikes = {
        ...(session.extraSuperLikes || {})
      };

      const extraSuperLikeVotes = {
        ...(session.extraSuperLikeVotes || {})
      };

      // ---------------------------------------------
      // VALIDATE VOTE
      // ---------------------------------------------

      if (Object.values(vetoes).includes(placeId)) {
        throw fail(
          409,
          "This restaurant has been vetoed"
        );
      }

      if (votes[placeId]?.[req.uid] !== undefined) {
        throw fail(409, "You have already voted");
      }

      // ---------------------------------------------
      // SUPER LIKE
      // ---------------------------------------------

      if (special === "super") {
        if (!superLikes[req.uid]) {
          // First Super Like is free.
          superLikes[req.uid] = placeId;
        } else {
          // Free Super Like already used.
          // Consume one purchased Super Like.

          const available =
            purchasedSuperLikesAvailable(
              session,
              req.uid
            );

          if (available < 1) {
            throw fail(
              409,
              "No Super Likes remaining. Buy an extra Super Like for 20 points."
            );
          }

          const record = extraSuperLikes[req.uid] || {
            purchased: 0,
            used: 0,
            refunded: 0
          };

          // Mark one purchased Super Like as used.
          extraSuperLikes[req.uid] = {
            ...record,
            used: (record.used || 0) + 1
          };

          // IMPORTANT:
          // Record the restaurant that received it.
          // winner.js uses this to add its bonus point.
          extraSuperLikeVotes[req.uid] = [
            ...(extraSuperLikeVotes[req.uid] || []),
            placeId
          ];
        }
      }

      // ---------------------------------------------
      // VETO
      // ---------------------------------------------

      if (special === "veto") {
        if (vetoes[req.uid]) {
          throw fail(
            409,
            "You have already used your Veto"
          );
        }

        vetoes[req.uid] = placeId;
      }

      // ---------------------------------------------
      // RECORD VOTE
      // ---------------------------------------------

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

      const memberIds = Object.keys(
        session.members || {}
      );

      const vetoed = Object.values(vetoes);

      const update = {
        votes,
        superLikes,
        vetoes,
        extraSuperLikes,
        extraSuperLikeVotes
      };

      // ---------------------------------------------
      // UNANIMOUS WINNER
      // ---------------------------------------------

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
          tieBreak: null,
          completedAt: Date.now()
        });

        return {
          done: true,
          winner: place
        };
      }

      tx.update(ref, update);

      // ---------------------------------------------
      // CHECK IF EVERYONE HAS VOTED
      // ---------------------------------------------

      const remaining = (
        session.shortlist || []
      ).filter(
        item => !vetoed.includes(item.id)
      );

      const allVoted = remaining.every(place =>
        memberIds.every(
          uid =>
            votes[place.id]?.[uid] !== undefined
        )
      );

      return { allVoted };
    });

    if (result.done) {
      await processCompletedSession(ref.id);
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

// =====================================================
// FINISH VOTING
// POST /api/sessions/:code/finish
// =====================================================

router.post("/:code/finish", async (req, res, next) => {
  try {
    const ref = db
      .collection("sessions")
      .doc(req.params.code);

    const snap = await ref.get();

    if (!snap.exists) {
      throw fail(404, "Session not found");
    }

    if (!snap.data().members?.[req.uid]) {
      throw fail(
        403,
        "You are not in this session"
      );
    }

    if (snap.data().status === "done") {
      await processCompletedSession(ref.id);

      return res.json({
        ok: true,
        alreadyFinished: true
      });
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
